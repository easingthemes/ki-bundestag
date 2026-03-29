export function EmptyState({ message, icon }: { message: string; icon?: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      {icon && <span className="text-4xl block mb-3">{icon}</span>}
      <p>{message}</p>
    </div>
  );
}
