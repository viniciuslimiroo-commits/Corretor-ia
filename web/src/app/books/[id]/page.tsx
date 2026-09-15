import { redirect } from "next/navigation";

// O editor mudou de endereço junto com a listagem. Link de book aberto continua abrindo.
export default async function BookAntigo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/editor/material/${id}`);
}
