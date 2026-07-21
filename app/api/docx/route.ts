import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
} from "docx";

export const runtime = "nodejs";

function markdownToParagraphs(markdown: string): Paragraph[] {
  const lines = markdown.split("\n");
  const paragraphs: Paragraph[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      continue;
    }
    if (line.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^##\s+/, ""),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 150 },
        })
      );
    } else if (line.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^###\s+/, ""),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        })
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^[-*]\s+/, ""),
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 120 },
        })
      );
    }
  }

  return paragraphs;
}

export async function POST(req: NextRequest) {
  try {
    const { plan_markdown, client_name, session_day } = (await req.json()) as {
      plan_markdown: string;
      client_name?: string;
      session_day?: string;
    };

    if (!plan_markdown) {
      return NextResponse.json(
        { error: "plan_markdown is required" },
        { status: 400 }
      );
    }

    const titleLine = `Session Plan — ${client_name ?? "Client"}${
      session_day ? ` (${session_day})` : ""
    }`;

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: titleLine,
              heading: HeadingLevel.TITLE,
              spacing: { after: 300 },
            }),
            ...markdownToParagraphs(plan_markdown),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="session-plan-${(
          client_name ?? "client"
        )
          .toLowerCase()
          .replace(/\s+/g, "-")}.docx"`,
      },
    });
  } catch (err: any) {
    console.error("docx route error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Something went wrong" },
      { status: 500 }
    );
  }
}
