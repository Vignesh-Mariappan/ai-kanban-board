"use client";

import { BoardWorkspace } from "@/components/BoardWorkspace";
import { SignInGate } from "@/components/SignInGate";

export default function Home() {
  return (
    <SignInGate>
      {(boards, authHeader) => (
        <BoardWorkspace initialBoards={boards} authHeader={authHeader} />
      )}
    </SignInGate>
  );
}
