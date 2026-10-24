import type { ChangeEvent } from "../fs/watcher.ts";

export type Subscriber = (event: ChangeEvent) => void;

export type Broadcaster = {
  /** 購読を開始する。戻り値を呼ぶと解除される */
  readonly subscribe: (subscriber: Subscriber) => () => void;
  readonly publish: (event: ChangeEvent) => void;
  /** 現在の購読者数（テストと診断用） */
  readonly size: () => number;
};

/** 変更イベントを接続中のブラウザへ配る。 */
export const createBroadcaster = (): Broadcaster => {
  const subscribers = new Set<Subscriber>();

  return {
    subscribe: (subscriber) => {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
    publish: (event) => {
      for (const subscriber of subscribers) subscriber(event);
    },
    size: () => subscribers.size,
  };
};
