import { NextResponse } from "next/server";
import { loadBoxes, publicBox } from "@/lib/mail/store";
import { readAll } from "@/lib/mail/imap";
import { isHidden, loadState } from "@/lib/state";
import { SPACE_IDS, spaceOf } from "@/lib/config";

export async function GET(req: Request) {
  const space = spaceOf(new URL(req.url).searchParams.get("space")) ?? SPACE_IDS[0];
  const boxes = (await loadBoxes()).filter((b) => b.space === space);
  const [result, state] = await Promise.all([readAll(boxes), loadState()]);
  const mails = result.mails.filter((m) => m.dir === "out" || !isHidden(m.address, state.hidden));
  return NextResponse.json({
    mailboxes: boxes.map(publicBox),
    ...result,
    mails,
    hiddenCount: result.mails.length - mails.length,
    hidden: state.hidden,
    known: state.known,
    dismissed: state.dismissed,
  });
}
