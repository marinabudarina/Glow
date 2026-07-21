/**
 * Design tokens for the Marina mobile intro.
 * Derived from the sibling web artifact's palette (hello-world-glow).
 */

const colors = {
  light: {
    text: '#3a3050',
    tint: '#5b1fd6',

    background: '#faf7ff',
    foreground: '#3a3050',

    card: '#f0ecff',
    cardForeground: '#3a3050',

    primary: '#5b1fd6',
    primaryForeground: '#ffffff',

    secondary: '#f0ecff',
    secondaryForeground: '#3a3050',

    muted: '#ede8ff',
    mutedForeground: '#8070a8',

    accent: '#ff3bd4',
    accentForeground: '#ffffff',

    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    border: 'rgba(58,48,80,0.1)',
    input: 'rgba(58,48,80,0.12)',
  },

  dark: {
    text: '#ffffff',
    tint: '#ff3bd4',

    background: '#0c0622',
    foreground: '#ffffff',

    card: '#1a0e3a',
    cardForeground: '#ffffff',

    primary: '#ff3bd4',
    primaryForeground: '#0c0622',

    secondary: '#1a0e3a',
    secondaryForeground: '#ffffff',

    muted: '#1a0e3a',
    mutedForeground: 'rgba(255,255,255,0.5)',

    accent: '#5b1fd6',
    accentForeground: '#ffffff',

    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    border: 'rgba(255,255,255,0.08)',
    input: 'rgba(255,255,255,0.1)',
  },

  radius: 10,
};

export default colors;
