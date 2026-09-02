import type { SemanticTone } from '@runew/domain-types';
import { Glyph } from '@/components/icons/Glyph';
import classNames from '@/utils/classNames';
import styles from './buttons.module.scss';

export type ButtonState = 'default' | 'pressed' | 'loading' | 'disabled';

export interface BaseButtonProps {
  label: string;
  tone?: SemanticTone;
  state?: ButtonState;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  fullWidth?: boolean;
}

function toneClass(tone: SemanticTone) {
  return styles[`tone-${tone}`];
}

export function PrimaryActionButton({
  label,
  tone = 'apricot',
  state = 'default',
  icon,
  onClick,
  className,
  fullWidth = true,
}: BaseButtonProps) {
  const disabled = state === 'disabled' || state === 'loading';

  return (
    <button
      type="button"
      className={classNames(
        styles.primary,
        toneClass(tone),
        fullWidth ? styles.fullWidth : undefined,
        state === 'loading' ? styles.loading : undefined,
        disabled ? styles.disabled : undefined,
        className,
      )}
      aria-label={label}
      aria-busy={state === 'loading'}
      disabled={disabled}
      onClick={onClick}
    >
      {state === 'loading' ? <span className={styles.spinner} aria-hidden /> : icon}
      <span className={styles.label}>{label}</span>
    </button>
  );
}

export function SecondaryGlassButton({
  label,
  state = 'default',
  onClick,
  className,
  fullWidth = true,
}: BaseButtonProps) {
  const disabled = state === 'disabled' || state === 'loading';

  return (
    <button
      type="button"
      className={classNames(
        styles.secondary,
        fullWidth ? styles.fullWidth : undefined,
        disabled ? styles.disabled : undefined,
        className,
      )}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {state === 'loading' ? <span className={styles.spinner} aria-hidden /> : null}
      <span className={styles.label}>{label}</span>
    </button>
  );
}

export function IconActionButton({
  label,
  icon,
  onClick,
  state = 'default',
}: BaseButtonProps) {
  const disabled = state === 'disabled' || state === 'loading';
  return (
    <button
      type="button"
      className={classNames(styles.iconAction, disabled ? styles.disabled : undefined)}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon ?? <Glyph name="sparkle" size="sm" />}
    </button>
  );
}

export function DangerButton({ label, state = 'default', onClick }: BaseButtonProps) {
  const disabled = state === 'disabled' || state === 'loading';
  return (
    <button
      type="button"
      className={classNames(styles.danger, disabled ? styles.disabled : undefined)}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {state === 'loading' ? <span className={styles.spinner} aria-hidden /> : null}
      <span className={styles.label}>{label}</span>
    </button>
  );
}

export function TextAction({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={classNames(styles.textAction, disabled ? styles.disabled : undefined)}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
