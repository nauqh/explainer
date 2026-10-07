declare module "react-scrollama" {
  import type { ReactElement, ReactNode } from "react";

  export type StepEvent<T> = { data: T; direction: "up" | "down"; element: HTMLElement };

  export function Scrollama<T>(props: {
    children: ReactNode;
    offset?: number | string;
    onStepEnter?: (e: StepEvent<T>) => void;
    onStepExit?: (e: StepEvent<T>) => void;
  }): ReactElement;

  export function Step<T>(props: { data?: T; children: ReactElement }): ReactElement;
}
