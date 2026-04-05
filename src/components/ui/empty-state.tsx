import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

export function EmptyState({ icon = "📭", title, description, action, children }: EmptyStateProps) {
  return (
    <Card className="shadow-xl border-2 border-gray-200">
      <CardContent className="text-center py-16 px-6">
        <div className="text-6xl mb-4">{icon}</div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6 max-w-md mx-auto">{description}</p>
        {action && (
          <Button onClick={action.onClick} className="rounded-full px-6">
            {action.label}
          </Button>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
