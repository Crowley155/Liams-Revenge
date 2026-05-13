const colors = {
  background: '#0f1117',
  surface: '#1a1d27',
  surfaceAlt: '#242837',
  border: '#2e3348',
  text: '#e2e4ed',
  textDim: '#a7adbf',
  accent: '#6c8aff',
  accentHover: '#8ba3ff',
  danger: '#ff6b6b',
  success: '#69db7c',
  warning: '#ffb347',
};

const fieldInput = {
  minHeight: '2.75rem',
  backgroundColor: colors.background,
  borderColor: colors.border,
  boxShadow: 'none',
  color: colors.text,
  fontSize: '0.875rem',
  fontWeight: 600,
  caretColor: colors.accent,
  '&::placeholder': {
    color: colors.textDim,
  },
  '&:hover': {
    borderColor: '#3f4866',
    backgroundColor: colors.background,
  },
  '&:focus': {
    borderColor: colors.accent,
    boxShadow: '0 0 0 3px rgba(108, 138, 255, 0.24)',
    backgroundColor: colors.background,
    color: colors.text,
  },
  '&:-webkit-autofill': {
    WebkitTextFillColor: colors.text,
    WebkitBoxShadow: `0 0 0 1000px ${colors.background} inset`,
    caretColor: colors.accent,
    transition: 'background-color 9999s ease-out 0s',
  },
  '&:autofill': {
    color: colors.text,
    boxShadow: `0 0 0 1000px ${colors.background} inset`,
  },
};

export const clerkAppearance = {
  theme: 'simple',
  variables: {
    colorPrimary: colors.accent,
    colorPrimaryForeground: colors.background,
    colorBackground: colors.surface,
    colorForeground: colors.text,
    colorMuted: colors.surfaceAlt,
    colorMutedForeground: colors.textDim,
    colorInput: colors.background,
    colorInputForeground: colors.text,
    colorBorder: colors.border,
    colorNeutral: colors.surfaceAlt,
    colorDanger: colors.danger,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorRing: colors.accent,
    colorModalBackdrop: 'rgba(5, 7, 12, 0.74)',
    fontFamily: "'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontFamilyButtons: "'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    borderRadius: '0.375rem',
    spacing: '1rem',
  },
  elements: {
    modalBackdrop: {
      backgroundColor: 'rgba(5, 7, 12, 0.74)',
    },
    cardBox: {
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      boxShadow: '0 1.25rem 4rem rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(255, 255, 255, 0.03) inset',
    },
    card: {
      backgroundColor: colors.surface,
      color: colors.text,
    },
    headerTitle: {
      color: colors.text,
      fontSize: '1.05rem',
      fontWeight: 800,
      letterSpacing: '0',
    },
    headerSubtitle: {
      color: colors.textDim,
      lineHeight: 1.45,
    },
    dividerLine: {
      backgroundColor: colors.border,
    },
    dividerText: {
      color: colors.textDim,
    },
    formFieldLabel: {
      color: colors.text,
      fontSize: '0.78rem',
      fontWeight: 800,
    },
    formFieldLabelRow: {
      color: colors.text,
    },
    formFieldInput: fieldInput,
    formFieldInputShowPasswordButton: {
      color: colors.textDim,
      minHeight: '2.5rem',
      minWidth: '2.5rem',
      '&:hover': {
        color: colors.text,
        backgroundColor: 'transparent',
      },
      '&:focus': {
        boxShadow: '0 0 0 3px rgba(108, 138, 255, 0.24)',
      },
    },
    formFieldSuccessText: {
      color: colors.textDim,
    },
    formFieldErrorText: {
      color: colors.danger,
    },
    formFieldWarningText: {
      color: colors.warning,
    },
    formButtonPrimary: {
      minHeight: '2.75rem',
      backgroundColor: colors.accent,
      color: colors.background,
      fontWeight: 800,
      boxShadow: 'none',
      '&:hover, &:focus, &:active': {
        backgroundColor: colors.accentHover,
        color: colors.background,
      },
      '&:focus': {
        boxShadow: '0 0 0 3px rgba(108, 138, 255, 0.28)',
      },
    },
    socialButtonsBlockButton: {
      minHeight: '2.75rem',
      backgroundColor: colors.background,
      borderColor: colors.border,
      color: colors.text,
      boxShadow: 'none',
      fontWeight: 800,
      '&:hover, &:focus': {
        backgroundColor: colors.surfaceAlt,
        borderColor: '#3f4866',
        color: colors.text,
      },
      '&:focus': {
        boxShadow: '0 0 0 3px rgba(108, 138, 255, 0.24)',
      },
    },
    socialButtonsBlockButtonText: {
      color: colors.text,
      fontWeight: 800,
    },
    socialButtonsProviderIcon: {
      flexShrink: 0,
    },
    socialButtonsIconButton: {
      minHeight: '2.75rem',
      minWidth: '2.75rem',
      backgroundColor: colors.background,
      borderColor: colors.border,
      color: colors.text,
      boxShadow: 'none',
      '&:hover, &:focus': {
        backgroundColor: colors.surfaceAlt,
        borderColor: '#3f4866',
      },
      '&:focus': {
        boxShadow: '0 0 0 3px rgba(108, 138, 255, 0.24)',
      },
    },
    footer: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    footerActionText: {
      color: colors.textDim,
    },
    footerActionLink: {
      color: colors.accentHover,
      fontWeight: 800,
      '&:hover': {
        color: colors.text,
      },
    },
    identityPreviewText: {
      color: colors.text,
    },
    identityPreviewEditButton: {
      color: colors.accentHover,
    },
    formResendCodeLink: {
      color: colors.accentHover,
    },
    otpCodeFieldInput: fieldInput,
    alert: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      color: colors.text,
    },
    alertText: {
      color: colors.text,
    },
    organizationSwitcherTrigger:
      'min-h-11 rounded-md border border-border bg-background px-3 py-2 text-text hover:bg-surface-alt',
    organizationPreviewTextContainer: 'text-text',
    userButtonAvatarBox: 'h-9 w-9',
  },
};
