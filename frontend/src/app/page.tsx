"use client";

import { KanbanBoard } from "@/components/KanbanBoard";
import { SignInGate } from "@/components/SignInGate";

export default function Home() {
  return (
    <SignInGate>
      {(board, authHeader) => (
        <KanbanBoard initialBoard={board} authHeader={authHeader} />
      )}
    </SignInGate>
  );
}
