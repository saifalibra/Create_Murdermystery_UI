import { useEffect, useRef } from "react";

/**
 * 自動保存用のカスタムフック
 * @param value 保存する値
 * @param saveFn 保存関数
 * @param delay デバウンス時間（ms、デフォルト500ms）
 */
export function useAutoSave<T>(
  value: T,
  saveFn: (value: T) => Promise<void> | void,
  delay: number = 500
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    // 初回マウント時は保存しない
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // 既存のタイマーをクリア
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // 新しいタイマーを設定
    timeoutRef.current = setTimeout(() => {
      saveFn(value);
    }, delay);

    // クリーンアップ
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, saveFn, delay]);
}
