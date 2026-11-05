import AppKit
import CoreGraphics
import ScreenCaptureKit
import ApplicationServices
import IOKit.hidsystem

// Metadata by default; pixels only for an explicit capture RPC. No files/logs.
let excluded = Set(CommandLine.arguments.dropFirst().compactMap { Int32($0) })

let outputLock = NSLock()
func emit(_ object: Any) {
    outputLock.lock(); defer { outputLock.unlock() }
    if let bytes = try? JSONSerialization.data(withJSONObject: object, options: [.fragmentsAllowed]),
       let text = String(data: bytes, encoding: .utf8) { print(text) } else { print("null") }
    fflush(stdout)
}
// A dedicated run loop receives AX events even while the serial RPC reader is
// blocked. Only PID/token/revision leave this observer, never UI content.
final class InterfaceWatch {
    private var loop: CFRunLoop!
    private let ready = DispatchSemaphore(value: 0)
    private let state = NSLock()
    private var pid: Int32 = 0
    private var token = 0
    private var revision = 0
    private var lastEmit = Date.distantPast
    private var observer: AXObserver?
    private var app: AXUIElement?
    private var window: AXUIElement?
    private let notifications = ["AXFocusedWindowChanged", "AXFocusedUIElementChanged", "AXWindowCreated", "AXMenuOpened", "AXMenuClosed", "AXLayoutChanged", "AXMoved", "AXResized", "AXSelectedChildrenChanged"]
    init() {
        Thread.detachNewThread { [self] in
            loop = CFRunLoopGetCurrent()
            RunLoop.current.add(Port(), forMode: .default)
            ready.signal()
            CFRunLoopRun()
        }
        ready.wait()
    }
    private func perform(_ work: @escaping () -> Void) {
        CFRunLoopPerformBlock(loop, CFRunLoopMode.defaultMode.rawValue, work)
        CFRunLoopWakeUp(loop)
    }
    func count(_ target: Int32) -> Int {
        state.lock(); defer { state.unlock() }
        return pid == target ? revision : 0
    }
    private func clear() {
        if let observer { CFRunLoopRemoveSource(loop, AXObserverGetRunLoopSource(observer), .defaultMode) }
        observer = nil; app = nil; window = nil
        state.lock(); pid = 0; token = 0; revision = 0; state.unlock()
    }
    func stop(_ expected: Int) {
        perform { [self] in
            state.lock(); let matches = token == expected; state.unlock()
            if matches { clear() }
        }
    }
    func start(_ target: Int32, _ generation: Int) -> Bool {
        guard AXIsProcessTrusted(), !excluded.contains(target) else { return false }
        perform { [self] in
            clear()
            var created: AXObserver?
            guard AXObserverCreate(target, { _, _, _, _ in interfaceWatch.changed() }, &created) == .success, let created else { return }
            let application = AXUIElementCreateApplication(target)
            AXUIElementSetMessagingTimeout(application, 0.08)
            observer = created; app = application
            state.lock(); pid = target; token = generation; state.unlock()
            for name in notifications { AXObserverAddNotification(created, application, name as CFString, nil) }
            bindWindow()
            CFRunLoopAddSource(loop, AXObserverGetRunLoopSource(created), .defaultMode)
        }
        return true
    }
    private func bindWindow() {
        guard let app, let observer,
              let value = attribute(app, kAXFocusedWindowAttribute as CFString), CFGetTypeID(value) == AXUIElementGetTypeID() else { return }
        let next = value as! AXUIElement
        if let window, CFEqual(window, next) { return }
        if let window { for name in notifications { AXObserverRemoveNotification(observer, window, name as CFString) } }
        window = next
        for name in notifications { AXObserverAddNotification(observer, next, name as CFString, nil) }
    }
    func changed() {
        state.lock()
        revision &+= 1
        let target = pid, generation = token
        let send = Date().timeIntervalSince(lastEmit) >= 0.04
        if send { lastEmit = Date() }
        state.unlock()
        bindWindow()
        if send && target > 0 { emit(["event": "interface-changed", "pid": target, "token": generation]) }
    }
}
let interfaceWatch = InterfaceWatch()
// Read only physical modifier state. A modifier-only chord is not an Electron
// accelerator; unlike a keyboard event tap this does not capture key events or
// depend on Accessibility/Input Monitoring consent. No typed text is read.
// BEGIN AREA SHORTCUT CHORD
struct AreaShortcutChord {
    private var latched = false
    private func bothDown(_ flags: CGEventFlags, _ leftControl: Bool) -> Bool {
        flags.contains(.maskSecondaryFn) && flags.contains(.maskControl) && leftControl
    }
    mutating func reset(_ flags: CGEventFlags, leftControl: Bool) {
        latched = bothDown(flags, leftControl)
    }
    mutating func update(_ flags: CGEventFlags, leftControl: Bool) -> Bool {
        let held = bothDown(flags, leftControl)
        let other = flags.intersection([.maskCommand, .maskAlternate, .maskShift])
        let pressed = held && !latched && other.isEmpty
        latched = held
        return pressed
    }
}
// END AREA SHORTCUT CHORD
final class AreaShortcutWatch {
    private let queue = DispatchQueue(label: "id.bito.area-modifiers", qos: .userInitiated)
    private var timer: DispatchSourceTimer?
    private var token = 0
    private var chord = AreaShortcutChord()
    private func state() -> (CGEventFlags, Bool) {
        // HID state avoids per-event synthetic Fn flags (e.g. arrow keys).
        let flags = CGEventSource.flagsState(.hidSystemState)
        let left = flags.rawValue & UInt64(NX_DEVICELCTLKEYMASK) != 0 ||
            (flags.contains(.maskControl) && CGEventSource.keyState(.hidSystemState, key: 59))
        return (flags, left)
    }
    func start(_ generation: Int) -> Bool {
        queue.sync {
            timer?.cancel(); token = generation
            let (flags, left) = state()
            chord.reset(flags, leftControl: left)
            let source = DispatchSource.makeTimerSource(queue: queue)
            source.schedule(deadline: .now(), repeating: .milliseconds(16), leeway: .milliseconds(3))
            source.setEventHandler { [weak self] in
                guard let self, self.token != 0 else { return }
                let (flags, left) = self.state()
                if self.chord.update(flags, leftControl: left) {
                    emit(["event": "area-shortcut", "token": self.token])
                }
            }
            timer = source; source.resume()
        }
        return true
    }
    func stop(_ generation: Int) {
        queue.sync {
            if token == generation { timer?.cancel(); timer = nil; token = 0 }
        }
    }
}
let areaShortcutWatch = AreaShortcutWatch()
// AX trees can expose hidden/covered menu items. A local continuation is allowed
// only if OS hit-testing at the current item's centre resolves to that item.
func hitVerified(_ element: AXUIElement, _ bounds: CGRect) -> Bool {
    let system = AXUIElementCreateSystemWide()
    AXUIElementSetMessagingTimeout(system, 0.01)
    var hit: AXUIElement?
    guard AXUIElementCopyElementAtPosition(system, Float(bounds.midX), Float(bounds.midY), &hit) == .success else { return false }
    for _ in 0..<4 {
        guard let current = hit else { return false }
        AXUIElementSetMessagingTimeout(current, 0.01)
        if CFEqual(current, element) { return true }
        let role = attribute(current, kAXRoleAttribute as CFString) as? String ?? ""
        if ["AXMenu", "AXWindow", "AXApplication"].contains(role) { return false }
        guard let parent = attribute(current, kAXParentAttribute as CFString), CFGetTypeID(parent) == AXUIElementGetTypeID() else { return false }
        hit = (parent as! AXUIElement)
    }
    return false
}
func attribute(_ element: AXUIElement, _ name: CFString) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name, &value) == .success ? value : nil
}
func observe(_ pid: Int32) -> [String: Any] {
    var front = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
    // When AX is already permitted, read focus directly from the system-wide
    // accessibility object. No prompt or editable field value is requested.
    let system = AXUIElementCreateSystemWide()
    AXUIElementSetMessagingTimeout(system, 0.08)
    if let focused = attribute(system, kAXFocusedApplicationAttribute as CFString),
       CFGetTypeID(focused) == AXUIElementGetTypeID() {
        var focusedPID: pid_t = 0
        if AXUIElementGetPid(focused as! AXUIElement, &focusedPID) == .success, focusedPID > 0 {
            front = focusedPID
        }
    }
    let activity = String(CGEventSource.counterForEventType(.combinedSessionState, eventType: .leftMouseUp)) + ":" +
        String(CGEventSource.counterForEventType(.combinedSessionState, eventType: .keyUp)) + ":" +
        String(CGEventSource.counterForEventType(.combinedSessionState, eventType: .scrollWheel)) + ":" + String(interfaceWatch.count(pid))
    let trusted = AXIsProcessTrusted()
    var elements = [[String: Any]]()
    if trusted && !excluded.contains(pid) {
        let application = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(application, 0.08)
        let started = Date()
        var hitTestTime: TimeInterval = 0
        let roles: Set<String> = ["AXButton", "AXMenuBarItem", "AXMenuItem", "AXPopUpButton", "AXLink", "AXTextField", "AXCheckBox", "AXRadioButton", "AXTab", "AXDisclosureTriangle", "AXComboBox"]
        var visited = 0
        func walk(_ element: AXUIElement, _ path: String, _ depth: Int) {
            guard depth <= 12, elements.count < 180, visited < 600, Date().timeIntervalSince(started) < 0.25 else { return }
            visited += 1
            let role = attribute(element, kAXRoleAttribute as CFString) as? String ?? ""
            // Never read field values or traverse secure input controls.
            if role == "AXSecureTextField" { return }
            let hidden = attribute(element, "AXHidden" as CFString) as? Bool ?? false
            if hidden { return }
            if roles.contains(role),
               let position = attribute(element, kAXPositionAttribute as CFString),
               let size = attribute(element, kAXSizeAttribute as CFString),
               CFGetTypeID(position) == AXValueGetTypeID(), CFGetTypeID(size) == AXValueGetTypeID() {
                var point = CGPoint.zero, dimensions = CGSize.zero
                AXValueGetValue(position as! AXValue, .cgPoint, &point)
                AXValueGetValue(size as! AXValue, .cgSize, &dimensions)
                if dimensions.width > 0 && dimensions.height > 0 {
                    let name = (attribute(element, kAXTitleAttribute as CFString) as? String) ??
                        (attribute(element, kAXDescriptionAttribute as CFString) as? String) ?? ""
                    var verified = false
                    if ["AXMenuBarItem", "AXMenuItem", "AXPopUpButton"].contains(role), hitTestTime < 0.06 {
                        let hitStart = Date()
                        verified = hitVerified(element, CGRect(origin: point, size: dimensions))
                        hitTestTime += Date().timeIntervalSince(hitStart)
                    }
                    elements.append(["id": String(path.prefix(80)), "role": role, "name": String(name.prefix(250)),
                        "enabled": attribute(element, kAXEnabledAttribute as CFString) as? Bool ?? true,
                        "hitVerified": verified,
                        "bounds": ["x": point.x, "y": point.y, "width": dimensions.width, "height": dimensions.height]])
                }
            }
            if let children = attribute(element, kAXChildrenAttribute as CFString) as? [AXUIElement] {
                for (index, child) in children.enumerated() { walk(child, path + "." + String(index), depth + 1) }
            }
        }
        // Menus can exist outside the main window's accessibility subtree.
        if let menu = attribute(application, kAXMenuBarAttribute as CFString), CFGetTypeID(menu) == AXUIElementGetTypeID() {
            walk(menu as! AXUIElement, "menu", 0)
        }
        if let window = attribute(application, kAXFocusedWindowAttribute as CFString), CFGetTypeID(window) == AXUIElementGetTypeID() {
            walk(window as! AXUIElement, "window", 0)
        }
    }
    return ["frontPid": front, "activity": activity, "accessible": trusted, "elements": elements]
}
func context() -> [String: Any]? {
    guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
    for window in windows {
        guard let pid = window[kCGWindowOwnerPID as String] as? Int32,
              !excluded.contains(pid),
              let layer = window[kCGWindowLayer as String] as? Int, layer == 0,
              let bounds = window[kCGWindowBounds as String] as? [String: Double],
              let x = bounds["X"], let y = bounds["Y"],
              let width = bounds["Width"], let height = bounds["Height"], width >= 100, height >= 70,
              let number = window[kCGWindowNumber as String] as? UInt32 else { continue }
        let name = window[kCGWindowOwnerName as String] as? String ?? "Application"
        if ["Window Server", "Dock", "Notification Center", "Control Center", "SystemUIServer"].contains(name) { continue }
        return ["id": String(number), "pid": pid, "app": name,
                "title": window[kCGWindowName as String] as? String ?? "",
                "bounds": ["x": x, "y": y, "width": width, "height": height]]
    }
    return nil
}
@available(macOS 14.0, *)
func capture(_ displayID: UInt32, selection: Bool = false) async -> [String: Any]? {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.displayID == displayID }) else { return nil }
        let apps = content.applications.filter { excluded.contains($0.processID) }
        // Capture the visible display without Bito, including application menus
        // and popovers that Electron's individual-window thumbnails omit.
        let filter = SCContentFilter(display: display, excludingApplications: apps, exceptingWindows: [])
        if #available(macOS 14.2, *) { filter.includeMenuBar = true }
        let config = SCStreamConfiguration()
        let ratio = selection ? min(2.0, 3600.0 / max(display.frame.width, display.frame.height)) : min(1.0, 1800.0 / max(display.frame.width, display.frame.height))
        config.width = Int((display.frame.width * ratio).rounded())
        config.height = Int((display.frame.height * ratio).rounded())
        config.showsCursor = false
        let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        let bitmap = NSBitmapImageRep(cgImage: image)
        guard let data = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) else { return nil }
        return ["data": data.base64EncodedString(), "width": image.width, "height": image.height,
                "bounds": ["x": display.frame.minX, "y": display.frame.minY,
                           "width": display.frame.width, "height": display.frame.height]]
    } catch { return nil }
}
@main struct Helper {
    static func main() async {
        while let line = readLine() {
            // The RPC reader blocks between requests. Drain pending AppKit
            // notifications so NSWorkspace focus is refreshed even without AX.
            await MainActor.run {
                _ = RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.005))
            }
            var object: Any = NSNull()
            if line == "read" { object = context() as Any? ?? NSNull() }
            else if line == "accessibility" { object = AXIsProcessTrusted() }
            else if line == "request-accessibility" {
                object = await MainActor.run {
                    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
                    return AXIsProcessTrustedWithOptions(options)
                }
            }
            else if line.hasPrefix("area-shortcut:"), let token = Int(line.dropFirst(14)) { object = areaShortcutWatch.start(token) }
            else if line.hasPrefix("stop-area-shortcut:"), let token = Int(line.dropFirst(19)) { areaShortcutWatch.stop(token); object = true }
            else if line.hasPrefix("capture-selection:"), let id = UInt32(line.dropFirst(18)) {
                if #available(macOS 14.0, *) { object = await capture(id, selection: true) as Any? ?? NSNull() }
            }
            else if line.hasPrefix("watch:") {
                let parts = line.split(separator: ":")
                if parts.count == 3, let pid = Int32(parts[1]), pid > 0, let token = Int(parts[2]) { object = interfaceWatch.start(pid, token) }
            }
            else if line.hasPrefix("unwatch:"), let token = Int(line.dropFirst(8)) { interfaceWatch.stop(token); object = true }
            else if line.hasPrefix("observe:"), let pid = Int32(line.dropFirst(8)), pid > 0 { object = observe(pid) }
            else if line.hasPrefix("activate:"), let pid = Int32(line.dropFirst(9)), pid > 0, !excluded.contains(pid) {
                object = await MainActor.run {
                    NSRunningApplication(processIdentifier: pid)?.activate(options: [.activateIgnoringOtherApps]) ?? false
                }
            }
            else if line.hasPrefix("capture:"), let id = UInt32(line.dropFirst(8)) {
                if #available(macOS 14.0, *) { object = await capture(id) as Any? ?? NSNull() }
            }
            emit(object)
        }
    }
}
