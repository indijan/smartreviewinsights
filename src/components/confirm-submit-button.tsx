"use client";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmMessage: string;
};

export default function ConfirmSubmitButton({ confirmMessage, onClick, ...props }: Props) {
  return (
    <button
      {...props}
      onClick={(event) => {
        const ok = window.confirm(confirmMessage);
        if (!ok) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}

