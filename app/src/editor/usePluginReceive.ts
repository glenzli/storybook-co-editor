import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { createLogger } from '../utils/logger';

const logger = createLogger('PluginReceive');

export interface SavedImageEvent {
  filepath: string;
  stable_id?: string;
  page?: number;
  insert_after_current?: boolean;
  status: string;
}

interface BatchEvent {
  total?: number;
}

export interface PluginReceiveState {
  active: boolean;
  current: number;
  total: number;
}

export function usePluginReceive(onImageSaved: (event: SavedImageEvent) => void) {
  const [receivingState, setReceivingState] = useState<PluginReceiveState>({
    active: false,
    current: 0,
    total: 0,
  });

  useEffect(() => {
    const imageSaved = listen<SavedImageEvent>('image-saved', event => {
      logger.info('UI received image-saved', event.payload);
      onImageSaved(event.payload);
      setReceivingState(previous => {
        if (!previous.active) return previous;
        const current = previous.current + 1;
        return { ...previous, current, active: current < previous.total };
      });
    });

    const batchStarted = listen<BatchEvent>('batch-started', event => {
      logger.info('UI received batch-started', event.payload);
      setReceivingState({ active: true, current: 0, total: event.payload.total || 0 });
    });

    const batchCancelled = listen('batch-cancelled', () => {
      logger.info('UI received batch-cancelled');
      setReceivingState({ active: false, current: 0, total: 0 });
    });

    return () => {
      Promise.all([imageSaved, batchStarted, batchCancelled]).then(unlisten => {
        unlisten.forEach(stopListening => stopListening());
      });
    };
  }, [onImageSaved]);

  const cancelReceive = useCallback(async () => {
    try {
      await fetch('http://127.0.0.1:14320/api/cancel-batch', { method: 'POST' });
      setReceivingState({ active: false, current: 0, total: 0 });
    } catch (error) {
      logger.error('Failed to cancel receive', error);
    }
  }, []);

  return { receivingState, cancelReceive };
}
