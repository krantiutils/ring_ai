"use client";

import { useState } from "react";
import FlowBuilder from "@/components/flows/FlowBuilder";
import FlowLibrary from "@/components/flows/FlowLibrary";
import type { FlowTemplate } from "@/components/flows/FlowLibrary";

type View =
  | { type: "library" }
  | { type: "builder"; flowId?: string }
  | { type: "template"; template: FlowTemplate };

export default function FlowsPage() {
  const [view, setView] = useState<View>({ type: "library" });

  if (view.type === "builder") {
    return (
      <FlowBuilder
        initialFlowId={view.flowId}
        onBack={() => setView({ type: "library" })}
      />
    );
  }

  if (view.type === "template") {
    return (
      <FlowBuilder
        templateData={view.template}
        onBack={() => setView({ type: "library" })}
      />
    );
  }

  return (
    <FlowLibrary
      onNewFlow={() => setView({ type: "builder" })}
      onOpenFlow={(flowId) => setView({ type: "builder", flowId })}
      onNewFromTemplate={(template) => setView({ type: "template", template })}
    />
  );
}
