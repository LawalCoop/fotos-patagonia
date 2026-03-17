"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface BackendUser {
  id: number;
  email: string;
  is_active: boolean;
  role: {
    id: number;
    name: string;
    description?: string;
    permissions: Array<{
      id: number;
      name: string;
      description?: string;
    }>;
  };
}

export interface UserCreateInput {
  email: string;
  password: string;
  role_id: number;
  is_active?: boolean;
}

export interface UserUpdateInput {
  email?: string;
  password?: string | null;
  role_id?: number;
  is_active?: boolean;
}

export function useUsers() {
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<BackendUser[]>("/users/");
      setUsers(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      /* console.error("Error fetching users:", err); */  
    } finally {
      setLoading(false);
    }
  }, []);

  const getUser = async (userId: number): Promise<BackendUser> => {
    const data = await apiFetch<BackendUser>(`/users/${userId}`);
    return data;
  };

  const createUser = async (
    userData: UserCreateInput
  ): Promise<BackendUser> => {
    try {
        /* console.log("Creating user:", { ...userData, password: "***" }); */

      const result = await apiFetch<BackendUser>("/users/", {
        method: "POST",
        body: JSON.stringify(userData),
      });

      /* console.log("User created:", result); */
      return result;
    } catch (err: any) {
      setError(err.message);
      /* console.error("Error creating user:", err); */
      throw err;
    }
  };

  const updateUser = async (
    userId: number,
    userData: UserUpdateInput
  ): Promise<BackendUser> => {
    try {
      /* console.log(
        `Updating user ${userId}:`,
        userData.password ? { ...userData, password: "***" } : userData
      ); */ 

      const result = await apiFetch<BackendUser>(`/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify(userData),
      });

      /* console.log("User updated:", result); */
      return result;
    } catch (err: any) {
      setError(err.message);
      /* console.error("Error updating user:", err); */
      throw err;
    }
  };

  const deleteUser = async (userId: number): Promise<void> => {
    try {
      /* console.log(`Deleting user ${userId}`); */

      await apiFetch(`/users/${userId}`, {
        method: "DELETE",
      });

      /* console.log("User deleted successfully"); */
    } catch (err: any) {
      setError(err.message);
      /* console.error("Error deleting user:", err); */
      throw err;
    }
  };

  const adminChangePassword = async (userId: number, new_password: string): Promise<BackendUser> => {
    try {
      const result = await apiFetch<BackendUser>(`/users/${userId}/password`, {
        method: "PUT",
        body: JSON.stringify({ new_password }),
      });
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    loading,
    error,
    refetch: fetchUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    adminChangePassword,
  };
}
