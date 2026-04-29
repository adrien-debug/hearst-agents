declare module "react-cytoscapejs" {
  import type { ComponentType, CSSProperties } from "react";

  interface CytoscapeComponentProps {
    elements: Array<{ data: Record<string, unknown>; classes?: string }>;
    layout?: { name: string; [key: string]: unknown };
    stylesheet?: Array<{ selector: string; style: Record<string, unknown> }>;
    cy?: (cy: unknown) => void;
    style?: CSSProperties;
    className?: string;
  }

  const CytoscapeComponent: ComponentType<CytoscapeComponentProps>;
  export default CytoscapeComponent;
}
