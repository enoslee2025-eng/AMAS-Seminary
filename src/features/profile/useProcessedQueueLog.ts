import { Dispatch, SetStateAction, useEffect } from 'react';
import { buildScopedStorageKey, usePersistentState } from '../../hooks/usePersistentState';
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

function buildProcessedQueueLogSyncEvent(scopeKey?: string | null) {
  return `${processedQueueLogSyncEvent}:${scopeKey?.trim() || 'global'}`;
}

function readProcessedQueueLog(storageKey: string) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as ProcessedQueueLogItem[]).map(normalizeProcessedQueueLogItem) : [];
  } catch {
    return [];
  }
}

function writeProcessedQueueLog(storageKey: string, syncEventName: string, items: ProcessedQueueLogItem[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(syncEventName));
    }, 0);
  } catch {
    // Ignore storage failures in rebuild shell.
  }
}

function limitProcessedQueueLog(items: ProcessedQueueLogItem[]) {
  return items.slice(0, processedQueueLogLimit);
}

export function useProcessedQueueLog(scopeKey?: string | null): [
  ProcessedQueueLogItem[],
  Dispatch<SetStateAction<ProcessedQueueLogItem[]>>,
  (item: ProcessedQueueLogItem) => void,
] {
  const storageKey = buildScopedStorageKey(processedQueueLogStorageKey, scopeKey);
  const syncEventName = buildProcessedQueueLogSyncEvent(scopeKey);
  const [processedQueueLog, setProcessedQueueLog] = usePersistentState<ProcessedQueueLogItem[]>(
    storageKey,
    [],
  );

  useEffect(() => {
    const syncProcessedQueueLog = () => {
      setProcessedQueueLog(readProcessedQueueLog(storageKey));
    };

    window.addEventListener('storage', syncProcessedQueueLog);
    window.addEventListener(syncEventName, syncProcessedQueueLog);

    return () => {
      window.removeEventListener('storage', syncProcessedQueueLog);
      window.removeEventListener(syncEventName, syncProcessedQueueLog);
    };
  }, [setProcessedQueueLog, storageKey, syncEventName]);

  const appendProcessedQueueLog = (item: ProcessedQueueLogItem) => {
    setProcessedQueueLog((current) => {
      const next = limitProcessedQueueLog([item, ...current]);
      writeProcessedQueueLog(storageKey, syncEventName, next);
      return next;
    });
  };

  return [processedQueueLog, setProcessedQueueLog, appendProcessedQueueLog];
}
