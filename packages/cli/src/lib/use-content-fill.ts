import { useMemo } from "react";
import { useTerminalDimensions } from "@opentui/react";

type UseContentFillOptions = {
  message: string;
  maxWidth?: number;
  maxHeightRatio?: number;
  outerPadding?: number;
  borderLeft?: number;
  borderRight?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  minHeight?: number;
  useEllipsis?: boolean;
};

type UseContentFillResult = {
  lines: string[];
  textWidth: number;
  boxWidth: number;
  boxHeight: number;
  maxBoxWidth: number;
  maxBoxHeight: number;
};

const toCharLength = (value: string) => Array.from(value).length;

const wrapLine = (line: string, lineWidth: number): string[] => {
  if (lineWidth <= 0) return [line];

  const words = line.split(/(\s+)/);
  const lines: string[] = [];
  let buffer = "";

  for (const word of words) {
    const next = buffer + word;
    if (toCharLength(next) <= lineWidth) {
      buffer = next;
      continue;
    }

    if (buffer.trim().length > 0) {
      lines.push(buffer.trimEnd());
      buffer = "";
    }

    if (toCharLength(word) > lineWidth) {
      const chars = Array.from(word);
      for (let i = 0; i < chars.length; i += lineWidth) {
        lines.push(chars.slice(i, i + lineWidth).join(""));
      }
    } else {
      buffer = word.trimStart();
    }
  }

  if (buffer.trim().length > 0) {
    lines.push(buffer.trimEnd());
  }

  return lines.length ? lines : [""];
};

export function useContentFill({
  message,
  maxWidth = 60,
  maxHeightRatio = 0.5,
  outerPadding = 6,
  borderLeft = 0,
  borderRight = 0,
  paddingLeft = 2,
  paddingRight = 2,
  paddingTop = 1,
  paddingBottom = 1,
  minHeight = 3,
  useEllipsis = true,
}: UseContentFillOptions): UseContentFillResult {
  const { width, height } = useTerminalDimensions();

  return useMemo(() => {
    const horizontalInset = paddingLeft + paddingRight + borderLeft + borderRight;
    const verticalPadding = paddingTop + paddingBottom;
    const maxBoxWidth = Math.max(1, Math.min(maxWidth, width - outerPadding));
    const maxBoxHeight = Math.max(minHeight, Math.floor(height * maxHeightRatio));
    const maxTextWidth = Math.max(1, maxBoxWidth - horizontalInset);
    const maxTextLines = Math.max(1, maxBoxHeight - verticalPadding);

    const contentWidth = message
      .split(/\r?\n/)
      .reduce((max, line) => Math.max(max, toCharLength(line)), 0);

    const initialTextWidth = Math.max(1, Math.min(contentWidth, maxTextWidth));

    const wrappedLines = message
      .split(/\r?\n/)
      .flatMap((line) => wrapLine(line, initialTextWidth));

    const clampedLines = wrappedLines.slice(0, maxTextLines);
    if (useEllipsis && wrappedLines.length > maxTextLines) {
      const lastIndex = clampedLines.length - 1;
      const ellipsis = "...";
      const last = clampedLines[lastIndex] ?? "";
      const trimmed = Array.from(last)
        .slice(0, Math.max(1, initialTextWidth - ellipsis.length))
        .join("");
      clampedLines[lastIndex] = `${trimmed}${ellipsis}`;
    }

    const lineWidth = clampedLines.reduce(
      (max, line) => Math.max(max, toCharLength(line)),
      0,
    );

    const textWidth = Math.max(1, Math.min(lineWidth, maxTextWidth));
    const boxWidth = Math.max(1, textWidth + horizontalInset);
    const boxHeight = Math.min(maxBoxHeight, clampedLines.length + verticalPadding);

    return {
      lines: clampedLines,
      textWidth,
      boxWidth,
      boxHeight,
      maxBoxWidth,
      maxBoxHeight,
    };
  }, [
    message,
    maxWidth,
    maxHeightRatio,
    outerPadding,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
    minHeight,
    useEllipsis,
    width,
    height,
  ]);
}
