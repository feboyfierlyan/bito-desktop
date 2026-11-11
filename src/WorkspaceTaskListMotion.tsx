import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { motion, useIsPresent } from "motion/react";
import { ChevronDown } from "lucide-react";
import { BitoButton } from "./ui/controls";

const ease = [0.22, 0.7, 0.2, 1] as const;
const GroupMotion = createContext({ expanded: true, present: true });

export function TaskListGroup({
  title,
  count,
  reduced,
  children,
  groupKey,
  defaultExpanded = true,
  reviewHint = false,
  headerAction,
  disabled = false,
}: {
  title: string;
  count: number;
  reduced: boolean;
  children: ReactNode;
  groupKey: string;
  defaultExpanded?: boolean;
  reviewHint?: boolean;
  headerAction?: ReactNode;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const present = useIsPresent();
  const id = useId();
  return (
    <motion.section
      className={`task-group group-${groupKey}`}
      data-expanded={expanded}
      data-reduced-motion={reduced}
      aria-labelledby={`${id}-heading`}
      inert={!present}
      exit={{ height: 0, opacity: 0, marginBottom: 0 }}
      transition={{
        duration: reduced ? 0 : 0.36,
        delay: reduced ? 0 : 0.16,
        ease,
      }}
    >
      <h2 className="task-group-heading">
        <BitoButton
          type="button"
          className="task-group-toggle"
          id={`${id}-heading`}
          disabled={disabled}
          aria-expanded={expanded}
          aria-controls={`${id}-tasks`}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown size={16} aria-hidden="true" />
          <span>{title}</span>
          <span className="task-group-count">{count}</span>
          {reviewHint && !expanded && (
            <span className="task-group-review">Tinjau</span>
          )}
        </BitoButton>
        {headerAction}
      </h2>
      {/* One height animation owns the disclosure. Child rows only translate and
          fade on toggle; no grid interpolation or second height transition. */}
      <motion.div
        id={`${id}-tasks`}
        className="task-group-body"
        initial={false}
        animate={{ height: expanded ? "auto" : 0 }}
        transition={{ duration: reduced ? 0 : 0.42, ease }}
        inert={!expanded || !present}
        aria-hidden={!expanded || !present}
      >
        <GroupMotion.Provider value={{ expanded, present }}>
          <div className="task-group-body-inner">{children}</div>
        </GroupMotion.Provider>
      </motion.div>
    </motion.section>
  );
}

export function TaskListRowMotion({
  children,
  index,
  reduced,
}: {
  children: ReactNode;
  index: number;
  reduced: boolean;
}) {
  const group = useContext(GroupMotion);
  const present = useIsPresent();
  const leaving = !present || !group.present;
  const shown = group.expanded && !leaving;
  return (
    <motion.div
      className="task-row-motion"
      inert={leaving}
      initial={false}
      animate={{ height: "auto" }}
      exit={{ height: 0 }}
      transition={{
        duration: reduced ? 0 : 0.32,
        delay: reduced ? 0 : 0.18,
        ease,
      }}
    >
      <motion.div
        className="task-row-reveal"
        initial={reduced ? false : { opacity: 0, y: -5, filter: "blur(3px)" }}
        animate={{
          opacity: shown ? 1 : 0,
          y: reduced || shown ? 0 : leaving ? 8 : -5,
          filter: reduced || shown ? "blur(0px)" : "blur(3px)",
        }}
        transition={{
          duration: reduced ? 0 : shown ? 0.4 : 0.24,
          delay: reduced || !shown ? 0 : Math.min(index, 6) * 0.024,
          ease,
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
