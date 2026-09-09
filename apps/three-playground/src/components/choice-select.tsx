import React, { useState } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";

type Props = Omit<
  React.ComponentProps<typeof SelectTrigger>,
  "value" | "onChange" | "children"
> & {
  value: string;
  onValueChange(value: string): void;
  children: React.ReactNode;
};
/** Keep menus inside modal content, while Radix owns selection and focus. */
export function ChoiceSelect({
  value,
  onValueChange,
  children,
  disabled,
  ...props
}: Props) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      {...(disabled === undefined ? {} : { disabled })}
    >
      <SelectTrigger {...props} ref={setTrigger}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        container={trigger?.closest<HTMLElement>('[role="dialog"]')}
        position="popper"
        align="start"
        className="editor-select-menu"
        onEscapeKeyDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
      >
        {children}
      </SelectContent>
    </Select>
  );
}
export function ChoiceOption(props: React.ComponentProps<typeof SelectItem>) {
  return <SelectItem {...props} />;
}
