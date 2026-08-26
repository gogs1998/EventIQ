import { cx } from "@/lib/cx";
import type { TapeRow } from "@/lib/tape";

function Value({
  text,
  leading,
  corner,
  align,
}: {
  text?: string;
  leading: boolean;
  corner: "red" | "blue";
  align: "left" | "right";
}) {
  return (
    <div
      className={cx(
        "relative flex items-center gap-2 px-3 py-2",
        align === "right" ? "justify-end" : "justify-start",
      )}
    >
      {leading ? (
        <span
          className={cx(
            "absolute inset-y-1 w-[3px]",
            align === "right" ? "right-0" : "left-0",
            corner === "red" ? "bg-red-corner" : "bg-blue-corner",
          )}
        />
      ) : null}
      <span
        className={cx(
          "tnum display text-lg",
          text ? (leading ? "text-chalk" : "text-ash") : "text-ash-dim",
        )}
      >
        {text ?? "—"}
      </span>
    </div>
  );
}

export function TapeTable({ rows }: { rows: TapeRow[] }) {
  return (
    <div className="border-hairline divide-hairline divide-y border-y">
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[1fr_auto_1fr] items-center"
        >
          <Value
            text={row.red}
            leading={row.leader === "red"}
            corner="red"
            align="right"
          />
          <div className="flex min-w-24 flex-col items-center px-2">
            <span className="label">{row.label}</span>
            {row.edge ? (
              <span
                className={cx(
                  "tnum mt-0.5 font-mono text-[0.55rem] tracking-widest",
                  row.leader === "red" ? "text-red-corner-hot" : "text-blue-corner-hot",
                )}
              >
                {row.edge}
              </span>
            ) : null}
          </div>
          <Value
            text={row.blue}
            leading={row.leader === "blue"}
            corner="blue"
            align="left"
          />
        </div>
      ))}
    </div>
  );
}
