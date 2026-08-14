import React, { forwardRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import './primitives.css';

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

const buttonVariants = {
  primary: 'iasButtonPrimary',
  secondary: 'iasButtonSecondary',
  quiet: 'iasButtonQuiet',
  danger: 'iasButtonDanger'
};

const noticeVariants = {
  info: 'iasNoticeInfo',
  success: 'iasNoticeSuccess',
  warning: 'iasNoticeWarning',
  danger: 'iasNoticeDanger'
};

export const Button = forwardRef(function Button({ variant = 'secondary', size = 'default', className = '', type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cx('iasButton', buttonVariants[variant] || buttonVariants.secondary, size === 'small' && 'iasButtonSmall', className)}
      data-variant={variant}
      data-size={size}
      type={type}
      {...props}
    />
  );
});

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={cx('iasInput', className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={cx('iasTextarea', className)} {...props} />;
});

export const Switch = forwardRef(function Switch({ className = '', ...props }, ref) {
  return (
    <SwitchPrimitive.Root ref={ref} className={cx('iasSwitch', className)} {...props}>
      <SwitchPrimitive.Thumb className="iasSwitchThumb" />
    </SwitchPrimitive.Root>
  );
});

export const IconButton = forwardRef(function IconButton({ className = '', tone = 'default', type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cx('iasIconButton', tone === 'danger' && 'iasIconButtonDanger', className)}
      data-tone={tone}
      type={type}
      {...props}
    />
  );
});

export function Notice({ tone = 'info', icon: Icon, children, className = '', ...props }) {
  const role = tone === 'danger' ? 'alert' : 'status';
  return (
    <div className={cx('iasNotice', noticeVariants[tone] || noticeVariants.info, className)} role={role} {...props}>
      {Icon ? <Icon aria-hidden="true" size={16} /> : null}
      <span>{children}</span>
    </div>
  );
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export const DialogContent = forwardRef(function DialogContent({ className = '', children, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="iasUiDialogOverlay" />
      <DialogPrimitive.Content ref={ref} className={cx('iasUiDialogContent', className)} {...props}>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
