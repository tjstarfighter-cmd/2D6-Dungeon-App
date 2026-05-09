import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { ParseResult } from "@/lib/contents-parser";
import type { PinKind } from "@/types/mapv2";

// Story 6.5 — bridge state for the room-gen flow's preview-confirm
// dialog. Three players coordinate through this context:
//   - MapV2 (Story 6.4) sets `pending` when the user taps Roll on the
//     post-pin contents prompt. The pending tag survives the
//     navigation to /tables/<id>.
//   - Tables (Story 6.5) reads `pending` inside its handleResolveRoll
//     hook. On a hit, it parses the rolled cell and calls openPreview
//     with the ParseResult.
//   - Shell renders the RoomGenPreviewModal driven by `preview`.

export interface RoomGenPending {
  regionHash: string;
  mapId: string;
  level: number;
  ancestry: string;
  pinKind: PinKind;
  /** The table id the contents prompt routed the player to. Used to
   *  scope the resolveRoll hook so unrelated rolls (an idle player
   *  exploring the Tables view) don't fire the preview by accident. */
  tableId: string;
}

export interface RoomGenPreview {
  regionHash: string;
  mapId: string;
  parse: ParseResult;
  /** The id of the table that produced the rolled cell. Useful for the
   *  preview header ("from L1HA_Rooms"). */
  fromTableId: string;
  rolledValue: string;
}

export interface RoomGenApi {
  pending: RoomGenPending | null;
  preview: RoomGenPreview | null;
  startContentsRoll: (input: RoomGenPending) => void;
  clearPending: () => void;
  openPreview: (input: RoomGenPreview) => void;
  closePreview: () => void;
}

const noop: RoomGenApi = {
  pending: null,
  preview: null,
  startContentsRoll: () => {},
  clearPending: () => {},
  openPreview: () => {},
  closePreview: () => {},
};

const RoomGenContext = createContext<RoomGenApi>(noop);

export function RoomGenProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<RoomGenPending | null>(null);
  const [preview, setPreview] = useState<RoomGenPreview | null>(null);

  const api = useMemo<RoomGenApi>(
    () => ({
      pending,
      preview,
      startContentsRoll: (input) => setPending(input),
      clearPending: () => setPending(null),
      openPreview: (input) => {
        setPreview(input);
        setPending(null);
      },
      closePreview: () => setPreview(null),
    }),
    [pending, preview],
  );

  return (
    <RoomGenContext.Provider value={api}>{children}</RoomGenContext.Provider>
  );
}

export function useRoomGen(): RoomGenApi {
  return useContext(RoomGenContext);
}

/** Stable callable that reads the latest pending each invocation. Used
 *  by Tables.handleResolveRoll which would otherwise capture a stale
 *  reference inside its useCallback. */
export function useRoomGenPendingReader(): () => RoomGenPending | null {
  const ctx = useContext(RoomGenContext);
  return useCallback(() => ctx.pending, [ctx]);
}
