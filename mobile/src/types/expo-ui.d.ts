import '@expo/ui/jetpack-compose';

declare module '@expo/ui/jetpack-compose' {
  interface ButtonProps {
    /**
     * Target identifier for widget interactions and deep links (e.g. "open:synx://..." or "complete:<id>").
     */
    target?: string;
  }
}
