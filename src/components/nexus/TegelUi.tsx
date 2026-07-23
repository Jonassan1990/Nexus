"use client";

import { TdsBanner, TdsButton, TdsMessage, TdsTag, TdsTextField } from "@scania/tegel-react";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import type { TegelTagVariant } from "@/lib/admin-config";
import { TegelIcon } from "./TegelIcon";
import type { TegelIconName } from "./TegelIcon";
import { ensureTegelElements } from "./TegelProvider";

type TdsButtonProps = ComponentProps<typeof TdsButton>;
type TdsTagProps = ComponentProps<typeof TdsTag>;
type TdsBannerProps = ComponentProps<typeof TdsBanner>;

export type TegelButtonVariant = NonNullable<TdsButtonProps["variant"]>;
export type TegelButtonSize = NonNullable<TdsButtonProps["size"]>;

const tagVariantMap: Record<TegelTagVariant, NonNullable<TdsTagProps["variant"]>> = {
  success: "success",
  warning: "warning",
  error: "error",
  information: "information",
  new: "information",
  neutral: "neutral"
};

function useClientMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    ensureTegelElements();
    setMounted(true);
  }, []);

  return mounted;
}

function readFieldValue(event: { detail?: unknown; target?: EventTarget | null }): string {
  if (typeof event.detail === "string") {
    return event.detail;
  }

  if (typeof event.detail === "object" && event.detail && "value" in event.detail) {
    return String((event.detail as { value?: unknown }).value ?? "");
  }

  return String((event.target as HTMLInputElement | null)?.value ?? "");
}

export function TegelButton({
  text,
  variant = "primary",
  size = "md",
  type = "button",
  disabled = false,
  fullbleed = false,
  iconName,
  className = "",
  onClick
}: {
  text: string;
  variant?: TegelButtonVariant;
  size?: TegelButtonSize;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  fullbleed?: boolean;
  iconName?: TegelIconName;
  className?: string;
  onClick?: () => void;
}) {
  const mounted = useClientMounted();

  if (!mounted) {
    return (
      <button
        className={`${variant === "secondary" || variant === "ghost" ? "secondary-button" : "primary-button"} ${className}`.trim()}
        disabled={disabled}
        type={type}
        onClick={onClick}
      >
        {iconName ? <TegelIcon name={iconName} size="16px" /> : null}
        {text}
      </button>
    );
  }

  return (
    <TdsButton
      className={className}
      disabled={disabled}
      fullbleed={fullbleed}
      size={size}
      text={text}
      type={type}
      variant={variant}
      onClick={onClick}
    >
      {iconName ? (
        <span slot="icon">
          <TegelIcon name={iconName} size="16px" />
        </span>
      ) : null}
    </TdsButton>
  );
}

export function TegelTag({
  text,
  variant = "neutral",
  className = ""
}: {
  text: string;
  variant?: TegelTagVariant;
  className?: string;
}) {
  const mounted = useClientMounted();

  if (!mounted) {
    return <span className={`ticket-status-chip tag-variant-${variant} ${className}`.trim()}>{text}</span>;
  }

  return <TdsTag className={className} text={text} variant={tagVariantMap[variant] ?? "neutral"} />;
}

export function TegelBanner({
  header,
  subheader,
  variant = "information",
  iconName,
  className = ""
}: {
  header: string;
  subheader?: string;
  variant?: NonNullable<TdsBannerProps["variant"]>;
  iconName?: TegelIconName;
  className?: string;
}) {
  const mounted = useClientMounted();

  if (!mounted) {
    return (
      <div className={`tegel-banner-fallback tegel-banner-fallback-${variant} ${className}`.trim()}>
        {iconName ? <TegelIcon name={iconName} size="20px" /> : null}
        <strong>{header}</strong>
        {subheader ? <p>{subheader}</p> : null}
      </div>
    );
  }

  return (
    <TdsBanner className={className} header={header} subheader={subheader} variant={variant}>
      {iconName ? (
        <span slot="icon">
          <TegelIcon name={iconName} size="20px" />
        </span>
      ) : null}
    </TdsBanner>
  );
}

export function TegelMessage({
  header,
  children,
  variant = "information",
  modeVariant = "primary",
  className = ""
}: {
  header?: string;
  children: ReactNode;
  variant?: "information" | "error" | "warning" | "success";
  modeVariant?: "primary" | "secondary";
  className?: string;
}) {
  const mounted = useClientMounted();

  if (!mounted) {
    return (
      <div className={`tegel-message-fallback tegel-message-fallback-${variant} ${className}`.trim()}>
        {header ? <strong>{header}</strong> : null}
        <div>{children}</div>
      </div>
    );
  }

  return (
    <TdsMessage className={className} header={header} modeVariant={modeVariant} variant={variant}>
      {children}
    </TdsMessage>
  );
}

export function TegelTextField({
  label,
  value,
  placeholder,
  disabled = false,
  className = "",
  onChange
}: {
  label?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
}) {
  const mounted = useClientMounted();
  const fieldId = useId();

  if (!mounted) {
    return (
      <label className={`tegel-text-field-fallback form-field ${className}`.trim()} htmlFor={fieldId}>
        {label ? <span>{label}</span> : null}
        <input
          disabled={disabled}
          id={fieldId}
          placeholder={placeholder}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  return (
    <TdsTextField
      className={className}
      disabled={disabled}
      label={label}
      placeholder={placeholder}
      value={value}
      onTdsChange={(event) => onChange(readFieldValue(event))}
      onTdsInput={(event) => onChange(readFieldValue(event))}
    />
  );
}
