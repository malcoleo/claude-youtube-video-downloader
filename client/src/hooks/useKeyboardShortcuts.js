// client/src/hooks/useKeyboardShortcuts.js
import { useEffect } from 'react';

const useKeyboardShortcuts = (shortcuts) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Create a key combination string for comparison
      const keyCombo = [];
      if (e.ctrlKey) keyCombo.push('ctrl');
      if (e.metaKey) keyCombo.push('meta');
      if (e.shiftKey) keyCombo.push('shift');
      if (e.altKey) keyCombo.push('alt');

      // Normalize the key to lowercase for consistent comparison
      const normalizedKey = e.key.toLowerCase();
      keyCombo.push(normalizedKey);
      const comboString = keyCombo.join('+');

      // Look for matching shortcuts
      for (const [shortcut, handler] of Object.entries(shortcuts)) {
        // Normalize the stored shortcut for comparison
        const normalizedShortcut = shortcut.toLowerCase();

        if (comboString === normalizedShortcut) {
          e.preventDefault();
          handler(e);
          break;
        }
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup function
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts]);
};

export { useKeyboardShortcuts };