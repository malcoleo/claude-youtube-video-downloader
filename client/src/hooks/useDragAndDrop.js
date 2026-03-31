// client/src/hooks/useDragAndDrop.js
import { useState, useCallback } from 'react';

const useDragAndDrop = (onDropCallback) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    const dt = e.dataTransfer;
    if (dt.types && (dt.types.indexOf ? dt.types.indexOf('Files') !== -1 : dt.types.contains('application/x-moz-file'))) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    // Set drop effect to copy
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(file =>
      file.type.startsWith('video/') ||
      file.type === 'audio/mp4' ||
      file.type === 'audio/mpeg' ||
      file.name.toLowerCase().endsWith('.mp4') ||
      file.name.toLowerCase().endsWith('.mov') ||
      file.name.toLowerCase().endsWith('.avi') ||
      file.name.toLowerCase().endsWith('.wmv') ||
      file.name.toLowerCase().endsWith('.mkv') ||
      file.name.toLowerCase().endsWith('.mp3') ||
      file.name.toLowerCase().endsWith('.wav')
    );

    if (files.length > 0 && onDropCallback) {
      onDropCallback(files);
    }
  }, [onDropCallback]);

  const bindEvents = (elementRef) => {
    if (elementRef.current) {
      elementRef.current.addEventListener('dragenter', handleDragEnter);
      elementRef.current.addEventListener('dragleave', handleDragLeave);
      elementRef.current.addEventListener('dragover', handleDragOver);
      elementRef.current.addEventListener('drop', handleDrop);

      return () => {
        elementRef.current?.removeEventListener('dragenter', handleDragEnter);
        elementRef.current?.removeEventListener('dragleave', handleDragLeave);
        elementRef.current?.removeEventListener('dragover', handleDragOver);
        elementRef.current?.removeEventListener('drop', handleDrop);
      };
    }
  };

  return {
    isDragging,
    bindEvents,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop
  };
};

export { useDragAndDrop };