import type { AdminQuestionView } from "@/lib/requests/ask-admin";

export function AdminQuestions({ questions }: { questions: AdminQuestionView[] }) {
  if (questions.length === 0) {
    return (
      <p className="mt-4 text-sm text-ascend-taupe">No one has asked a question yet.</p>
    );
  }

  return (
    <ul className="mt-4 flex flex-col gap-3">
      {questions.map((question) => (
        <li
          key={question.id}
          className="rounded-xl border border-ascend-taupe/30 bg-ascend-surface p-4"
        >
          <p className="text-sm text-ascend-taupe">
            {question.requester_name} · {question.service_type} · {question.neighborhood}
          </p>
          <p className="mt-2 whitespace-pre-line text-ascend-ink">{question.message}</p>
          <p className="mt-2 text-xs text-ascend-taupe">
            {new Date(question.createdAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </li>
      ))}
    </ul>
  );
}
