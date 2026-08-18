import { redirect } from "next/navigation";

/** The CRM has two halves and companies is the one you reach for first. */
export default function CrmIndex() {
  redirect("/crm/companies");
}
