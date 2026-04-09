import type { TodoItem } from '../types/api/event'

type RawTodo = {
  content?: unknown
  status?: unknown
  priority?: unknown
}

function buildTodoId(todo: RawTodo, index: number): string {
  const content = String(todo.content ?? '').slice(0, 32)
  const status = String(todo.status ?? '')
  const priority = String(todo.priority ?? '')
  return `todo-${index}-${content}-${status}-${priority}`
}

export function normalizeTodoItems(todos: RawTodo[] | null | undefined): TodoItem[] {
  return (todos ?? []).map((todo, index) => ({
    id: buildTodoId(todo, index),
    content: String(todo.content ?? ''),
    status: todo.status as TodoItem['status'],
    priority: todo.priority as TodoItem['priority'],
  }))
}
