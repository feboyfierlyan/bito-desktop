import { createContext, useContext } from "react";

export const SetupContext = createContext<{
  ready: boolean;
  transitioning: boolean;
} | null>(null);
export const useSetupScene = () => useContext(SetupContext);
