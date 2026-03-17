import { Dispatch, SetStateAction, useEffect } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { ProcessedQueueLogItem } from './profileState';

const processedQueueLogStorageKey = 'amas_profile_processed_queue_log';
const processedQueueLogSyncEvent = 'amas:processed-queue-log-sync';
const processedQueueLogLimit = 48;

function normalizeProcessedQueueLogItem(item: ProcessedQueueLogItem): ProcessedQueueLogItem {
  return item.category === 'course'
    ? {
        ...item,
        category: 'learning',
      }
    : item;
}

function readProcessedQueueLog() {
  try {
    const stored = window.localStorage.getItem(processedQueueLogStorageKey);
    return stored ? (JSON.parse(stored) as ProcessedQueueLogItem[]).map(normalizeProcessedQueueLogItem) : [];
  } catch {
    return [];
  }
}

function writeProcessedQueueLog(items: ProcessedQueueLogItem[]) {
  try {
    window.localStorage.setItem(processedQueueLogStorageKey, JSON.stringify(items));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(processedQueueLogSyncEvent));
    }, 0);
  } catch {
    // Ignore storage failures in rebuild shell.
  }
}

function limitProcessedQueueLog(items: ProcessedQueueLogItem[]) {
  return items.slice(0, processedQueueLogLimit);
}

export function useProcessedQueueLog(): [
  ProcessedQueueLogItem[],
  Dispatch<SetStateAction<ProcessedQueueLogItem[]>>,
  (item: ProcessedQueueLogItem) => void,
] {
  const [processedQueueLog, setProcessedQueueLog] = usePersistentState<ProcessedQueueLogItem[]>(
    processedQueueLogStorageKey,
    [],
  );

  useEffect(() => {
    const syncProcessedQueueLog = () => {
      setProcessedQueueLog(readProcessedQueueLog());
    };

    window.addEventListener('storage', syncProcessedQueueLog);
    window.addEventListener(processedQueueLogSyncEvent, syncProcessedQueueLog);

    return () => {
      window.removeEventListener('storage', syncProcessedQueueLog);
      window.removeEventListener(processedQueueLogSyncEvent, syncProcessedQueueLog);
    };
  }, [setProcessedQueueLog]);

  const appendProcessedQueueLog = (item: ProcessedQueueLogItem) => {
    setProcessedQueueLog((current) => {
      const next = limitProcessedQueueLog([item, ...current]);
      writeProcessedQueueLog(next);
      return next;
    });
  };

  return [processedQueueLog, setProcessedQueueLog, appendProcessedQueueLog];
}
