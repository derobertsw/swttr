export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-4 mb-2">
      {children}
    </h4>
  );
}
