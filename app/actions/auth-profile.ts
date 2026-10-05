"use server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { AppError, publicError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function completeStaffPasswordChangeAction(): Promise<{ok:true}|{ok:false;message:string}> {
 try {
  const profile=await requireAuthenticatedUser();
  if(!["faculty","hod"].includes(profile.role)||!profile.must_change_password)throw new AppError("FORBIDDEN","No temporary password change is pending.");
  const supabase=await createSupabaseServerClient();
  const {error}=await supabase.rpc("complete_staff_password_change");
  if(error)throw new AppError("DATABASE_ERROR","Password changed, but the account could not be activated. Please retry.");
  return {ok:true};
 } catch(error){return {ok:false,message:publicError(error).message}}
}
