export const inputClass =
  "w-full bg-panel border border-hairline px-3 py-2 text-chalk text-sm outline-none focus:border-chalk/40 transition-colors placeholder:text-ash-dim";

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const DISCIPLINES = ["MMA", "MUAY_THAI", "BOXING", "K1", "GRAPPLING"] as const;

export const DISCIPLINE_NAME: Record<string, string> = {
  MMA: "MMA",
  MUAY_THAI: "Muay Thai",
  BOXING: "Boxing",
  K1: "K1",
  GRAPPLING: "Grappling",
};
