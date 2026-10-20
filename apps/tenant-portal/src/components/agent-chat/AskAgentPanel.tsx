import * as RadixDialog from "@radix-ui/react-dialog";
import { History, Plus, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";
import { cn } from "@/lib/utils";

import { useAskAgent, type AskTurn } from "./useAskAgent";

const EXAMPLE_QUESTIONS = [
  "How many shipments failed this week?",
  "Which drivers are overloaded?",
  "What's our SLA breach rate this month?"
];

type AskAgentPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AskAgentPanel({ open, onOpenChange }: AskAgentPanelProps) {
  const {
    turns,
    loading,
    conversations,
    ask,
    listConversations,
    loadConversation,
    newConversation
  } = useAskAgent();
  const [question, setQuestion] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest turn in view as new ones arrive.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  // Refresh the conversation list whenever the panel opens.
  useEffect(() => {
    if (open) void listConversations();
  }, [open, listConversations]);

  const historyItems: DropdownItem[] =
    conversations.length === 0
      ? [{ key: "empty", label: "No past conversations", disabled: true }]
      : conversations.map((c) => ({
          key: c.id,
          label: c.title,
          onSelect: () => void loadConversation(c.id)
        }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !question.trim()) return;
    const q = question;
    setQuestion("");
    await ask(q);
  }

  function handleExample(example: string) {
    if (loading) return;
    setQuestion("");
    void ask(example);
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-black/30",
            "data-[state=open]:animate-fauward-fade-in data-[state=closed]:animate-fauward-fade-out"
          )}
        />
        <RadixDialog.Content
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl",
            "focus-visible:outline-none",
            "data-[state=open]:animate-fauward-slide-in-right data-[state=closed]:animate-fauward-slide-out-right"
          )}
          aria-describedby={undefined}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 text-tenant-primary" />
              <div>
                <RadixDialog.Title className="text-base font-semibold text-gray-900">
                  Ask the agent
                </RadixDialog.Title>
                <p className="mt-0.5 text-xs text-gray-500">
                  Read-only. The agent answers from your live data and does not take actions yet.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Dropdown
                trigger={
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    aria-label="Conversation history"
                  >
                    <History size={15} />
                  </button>
                }
                items={historyItems}
              />
              <button
                type="button"
                onClick={() => newConversation()}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="New chat"
              >
                <Plus size={15} />
              </button>
              <RadixDialog.Close
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <X size={15} />
              </RadixDialog.Close>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
            {turns.length === 0 ? (
              <EmptyExamples onPick={handleExample} disabled={loading} />
            ) : (
              <div className="space-y-5">
                {turns.map((turn) => (
                  <Turn key={turn.id} turn={turn} />
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t border-gray-100 bg-gray-50 px-5 py-3"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Ask about your operations…"
                rows={1}
                maxLength={500}
                className="block w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-tenant-primary focus:outline-none focus:ring-1 focus:ring-tenant-primary"
              />
              <Button
                type="submit"
                size="sm"
                disabled={loading || !question.trim()}
                loading={loading}
                aria-label="Send question"
              >
                {!loading && <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function EmptyExamples({
  onPick,
  disabled
}: {
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Ask a plain-English question about your operations. Try one of these to start:
      </p>
      <div className="space-y-2">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            disabled={disabled}
            className="block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 hover:border-tenant-primary hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function Turn({ turn }: { turn: AskTurn }) {
  return (
    <div className="space-y-2">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-tenant-primary px-3 py-2 text-sm text-white">
        {turn.question}
      </div>
      {turn.pending && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-400" />
          Asking the agent…
        </div>
      )}
      {turn.error && (
        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {turn.error}
        </div>
      )}
      {turn.response && (
        <div
          className={cn(
            "w-fit max-w-[90%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm",
            turn.response.status === "error"
              ? "bg-red-50 text-red-700"
              : turn.response.status === "cannot_answer"
                ? "bg-amber-50 text-amber-900"
                : "bg-gray-100 text-gray-900"
          )}
        >
          <p className="whitespace-pre-wrap">{turn.response.answer}</p>
          {turn.response.toolsUsed.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-gray-200/60 pt-2">
              <span className="text-[10px] uppercase tracking-wide text-gray-500">Based on:</span>
              {turn.response.toolsUsed.map((tool, i) => (
                <span
                  key={`${tool.name}-${i}`}
                  className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-gray-200"
                >
                  {tool.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
