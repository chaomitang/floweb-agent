export interface WorkflowContext {
  navigate(url: string): Promise<void>;
  snapshot(label?: string): Promise<string>;
  snapshotDiff(): Promise<string>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  press(key: string): Promise<void>;
  evaluate(js: string): Promise<unknown>;
  log(message: string): void;
}

export interface WorkflowResult {
  success: boolean;
  steps: WorkflowStepResult[];
  error?: string;
}

export interface WorkflowStepResult {
  step: number;
  description: string;
  snapshot?: string;
  diff?: string;
  error?: string;
}
