"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchOrg,
  fetchOrgInvites,
  fetchOrgMembers,
  inviteOrgMember,
  revokeOrgInvite,
  updateOrgMember,
  type AccessPermissions,
} from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { canAccess } from "@/lib/access";

export const orgQueryKey = ["org"] as const;
export const orgMembersQueryKey = ["org-members"] as const;
export const orgInvitesQueryKey = ["org-invites"] as const;

export function useOrg() {
  const signedIn = useAuthStore((state) => Boolean(state.user));
  return useQuery({
    queryKey: orgQueryKey,
    queryFn: fetchOrg,
    enabled: signedIn,
  });
}

export function useOrgMembers() {
  const signedIn = useAuthStore((state) => Boolean(state.user));
  const permissions = useAuthStore((state) => state.user?.permissions);
  return useQuery({
    queryKey: orgMembersQueryKey,
    queryFn: fetchOrgMembers,
    enabled: signedIn && canAccess(permissions, "team", "read"),
  });
}

export function useOrgInvites() {
  const signedIn = useAuthStore((state) => Boolean(state.user));
  const permissions = useAuthStore((state) => state.user?.permissions);
  return useQuery({
    queryKey: orgInvitesQueryKey,
    queryFn: fetchOrgInvites,
    enabled: signedIn && canAccess(permissions, "team", "read"),
  });
}

export function useInviteMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      email: string;
      name: string;
      title?: string;
      role?: string;
      permissions?: AccessPermissions;
      agent_ids?: string[];
    }) => inviteOrgMember(body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: orgInvitesQueryKey });
    },
  });
}

export function useUpdateMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Parameters<typeof updateOrgMember>[1];
    }) => updateOrgMember(id, body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: orgMembersQueryKey });
      await client.invalidateQueries({ queryKey: orgQueryKey });
    },
  });
}

export function useRevokeInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeOrgInvite(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: orgInvitesQueryKey });
    },
  });
}
