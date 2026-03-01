"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FolderGit2,
  Plus,
  LayoutDashboard,
  Settings,
  LogOut,
} from "lucide-react";
import { UserButton, SignOutButton, useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Project = {
  id: string;
  name: string;
  updated_at?: string;
};

export default function Home() {
  const router = useRouter();
  const { user } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tier, setTier] = useState<"free" | "pro">("free");

  useEffect(() => {
    if (!user) return;

    const loadUserData = async () => {
      setIsLoading(true);

      // 1. Ensure user exists in profiles and get tier
      let { data: profile } = await supabase
        .from("profiles")
        .select("tier")
        .eq("clerk_id", user.id)
        .single();

      if (!profile) {
        // Create profile if doesn't exist
        const { data: newProfile } = await (supabase.from("profiles") as any)
          .insert({ clerk_id: user.id, tier: "free" })
          .select("tier")
          .single();
        profile = newProfile;
      }

      if (profile) setTier((profile as any).tier as "free" | "pro");

      // 2. Fetch projects
      const { data: userProjects } = await supabase
        .from("projects")
        .select("*")
        .eq("clerk_id", user.id)
        .order("updated_at", { ascending: false });

      if (userProjects) {
        setProjects(userProjects);
      }

      setIsLoading(false);
    };

    loadUserData();
  }, [user]);

  const handleOpenAddProjectModal = () => {
    if (tier === "free" && projects.length >= 3) {
      toast.error("Free Tier Limit Reached", {
        description:
          "You have reached the limit of 3 projects. Please upgrade to Pro to create more.",
        duration: 4000,
        descriptionClassName: "text-red-200/90 font-medium",
      });
      return;
    }
    setIsDialogOpen(true);
  };

  const handleAddProject = async () => {
    if (newProjectName.trim() === "" || !user) return;

    // Enforce limits
    if (tier === "free" && projects.length >= 3) {
      toast.error("Limit Reached", {
        description: "You have reached the free tier limit of 3 projects.",
        descriptionClassName: "text-black font-medium",
      });
      setIsDialogOpen(false);
      return;
    }

    // Since we omit ID in the insert, Supabase generates the UUID, we get it back
    const { data, error } = await (supabase.from("projects") as any)
      .insert({
        clerk_id: user.id,
        name: newProjectName.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating project:", error);
      toast.error("Failed to create project");
      return;
    }

    if (data) {
      setProjects([data, ...projects]);
      setNewProjectName("");
      setIsDialogOpen(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    const { error } = await supabase.from("projects").delete().eq("id", id);

    if (error) {
      console.error("Error deleting project:", error);
      toast.error("Failed to delete project");
      return;
    }

    setProjects(projects.filter((p) => p.id !== id));
  };

  const handleOpenProject = (id: string) => {
    router.push(`/draw/${id}`);
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b px-4 py-4">
            <h2 className="text-lg font-bold flex items-center gap-2 overflow-hidden whitespace-nowrap">
              <span className="group-data-[collapsible=icon]:hidden">
                Limorp
              </span>
            </h2>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive>
                      <LayoutDashboard />
                      <span>Projects</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <Settings />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t p-4 flex flex-row items-center gap-3">
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  userButtonAvatarBox: "w-8 h-8",
                },
              }}
            />
            <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-medium truncate">
                {user?.fullName || "User"}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {user?.primaryEmailAddress?.emailAddress || ""}
              </span>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0">
          <header className="flex h-16 items-center border-b px-6 gap-4 bg-background">
            <SidebarTrigger className="-ml-2" />
          </header>
          <div className="flex gap-4 p-6">
            <h1 className="text-xl font-semibold">Your Projects</h1>
            <div className="ml-auto flex items-center space-x-4">
              <Button
                size="sm"
                className="gap-1"
                onClick={handleOpenAddProjectModal}
              >
                <Plus className="h-4 w-4" /> Add Project
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Create new project</DialogTitle>
                    <DialogDescription>
                      Enter a name for your new project. Click save when you're
                      done.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="name" className="text-right">
                        Name
                      </Label>
                      <Input
                        id="name"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="My Awesome Project"
                        className="col-span-3"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddProject();
                        }}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" onClick={handleAddProject}>
                      Save Project
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex-1 px-6 flex flex-col h-full">
            {isLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : projects.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center space-y-4">
                <h3 className="text-xl font-medium tracking-tight">
                  No projects created yet
                </h3>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  Get started by creating a new project. You can manage your
                  tasks and files inside it.
                </p>
                <Button
                  onClick={handleOpenAddProjectModal}
                  variant="outline"
                  className="mt-4 gap-2"
                >
                  <Plus className="w-4 h-4" /> Create Project
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {projects.map((project) => (
                  <ContextMenu key={project.id}>
                    <ContextMenuTrigger>
                      <Card
                        className="hover:shadow-md transition-shadow cursor-pointer border-border/60"
                        onDoubleClick={() => handleOpenProject(project.id)}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base font-semibold truncate">
                            {project.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground">
                            {project.updated_at
                              ? new Date(
                                  project.updated_at,
                                ).toLocaleDateString()
                              : "Updated recently"}
                          </p>
                        </CardContent>
                      </Card>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onClick={() => handleOpenProject(project.id)}
                      >
                        Open
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => handleDeleteProject(project.id)}
                        className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                      >
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
