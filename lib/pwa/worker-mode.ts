export function workerMode(value: string | undefined): "register" | "remove" | "leave" {
  if (value === "true") return "register";
  if (value === "false") return "remove";
  return "leave";
}
