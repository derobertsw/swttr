"use client";

import { useState } from "react";
import { AlertTriangle, Check, CircleAlert, MapPin, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FieldError } from "@/components/FieldError";
import { cn } from "@/lib/utils";

type Appearance = "light" | "dark";

const SURFACES = [
  { token: "background", role: "Canvas", swatch: "bg-background" },
  { token: "card", role: "Surface: cards, inputs, sheets", swatch: "bg-card" },
  { token: "popover", role: "Overlay: menus, popovers", swatch: "bg-popover" },
  { token: "muted", role: "Muted: wells, tracks", swatch: "bg-muted" },
  { token: "accent", role: "Hover", swatch: "bg-accent" },
  { token: "primary-soft", role: "Selected", swatch: "bg-primary-soft" },
];

const MARKS = [
  { token: "primary", role: "Action", swatch: "bg-primary" },
  { token: "border", role: "Divider (decorative)", swatch: "bg-border" },
  { token: "input", role: "Control outline", swatch: "bg-input" },
  { token: "ring", role: "Focus", swatch: "bg-ring" },
  { token: "success", role: "Success", swatch: "bg-success" },
  { token: "warning", role: "Warning", swatch: "bg-warning" },
  { token: "destructive", role: "Error, destructive", swatch: "bg-destructive" },
];

const EFFORTS = ["Easy", "Moderate", "Hard"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <h3 className="text-xl font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Swatch({ token, role, swatch }: { token: string; role: string; swatch: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className={cn("size-10 shrink-0 rounded-control border border-border", swatch)} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{role}</span>
        <code className="block font-mono text-xs text-muted-foreground">{token}</code>
      </span>
    </li>
  );
}

function PalettePanel({ appearance }: { appearance: Appearance }) {
  const [effort, setEffort] = useState<(typeof EFFORTS)[number]>("Moderate");
  const id = (name: string) => `${appearance}-${name}`;

  return (
    <div
      data-appearance={appearance}
      className="space-y-6 rounded-sheet border border-border bg-background p-4 text-foreground sm:p-6"
    >
      <h2 className="text-2xl font-semibold capitalize">{appearance}</h2>

      <Section title="Color">
        <ul className="grid gap-3 sm:grid-cols-2">
          {SURFACES.map((item) => (
            <Swatch key={item.token} {...item} />
          ))}
        </ul>
        <ul className="grid gap-3 sm:grid-cols-2">
          {MARKS.map((item) => (
            <Swatch key={item.token} {...item} />
          ))}
        </ul>
        <div className="space-y-1 rounded-card bg-card p-4">
          <p className="text-foreground">foreground: headings and body text</p>
          <p className="text-muted-foreground">muted-foreground: supporting text</p>
          <p className="font-semibold text-primary">primary: links and accents</p>
        </div>
      </Section>

      <Section title="Type">
        <div className="space-y-2">
          <p className="text-title font-semibold md:text-title-lg">Page title</p>
          <p className="text-xl font-semibold">Section heading</p>
          <p className="text-base">Body and field text, 16px.</p>
          <p className="text-sm text-muted-foreground">Supporting labels and help, 14px.</p>
          <p className="text-xs text-muted-foreground">Short, nonessential metadata, 12px.</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg">
            <Plus />
            See my layers
          </Button>
          <Button size="sm" variant="outline">
            Small
          </Button>
          <Button size="icon" variant="outline" aria-label="Add">
            <Plus />
          </Button>
          <Button disabled>Disabled</Button>
          <Button loading>Saving...</Button>
        </div>
      </Section>

      <Section title="Fields">
        <div className="space-y-2">
          <label htmlFor={id("place")} className="text-sm font-medium">
            Where?
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id={id("place")} placeholder="Search town or mountain" className="pl-10" />
          </div>
          <p className="text-sm text-muted-foreground">Help text sits under the field.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor={id("time")} className="text-sm font-medium">
            Start time
          </label>
          <Input
            id={id("time")}
            defaultValue="25:00"
            aria-invalid
            aria-describedby={id("time-error")}
          />
          <FieldError id={id("time-error")}>Enter a time between 00:00 and 23:59.</FieldError>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={id("activity")} className="text-sm font-medium">
              Activity
            </label>
            <Select defaultValue="alpine">
              <SelectTrigger id={id("activity")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="alpine">Alpine Skiing</SelectItem>
                <SelectItem value="xc">XC Skiing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor={id("disabled")} className="text-sm font-medium">
              Disabled
            </label>
            <Input id={id("disabled")} disabled value="Not editable" readOnly />
          </div>
        </div>
      </Section>

      <Section title="Choices">
        <div className="space-y-2">
          <p id={id("effort")} className="text-sm font-medium">
            Effort
          </p>
          <div
            role="group"
            aria-labelledby={id("effort")}
            className={cn(segmentedGroupClassName, "grid-cols-3")}
          >
            {EFFORTS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={effort === option}
                onClick={() => setEffort(option)}
                className={segmentedItemClassName}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <Tabs defaultValue="wear">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wear">Wear</TabsTrigger>
            <TabsTrigger value="carry">Carry</TabsTrigger>
          </TabsList>
          <TabsContent value="wear" className="pt-2 text-sm text-muted-foreground">
            Tabs share the selected look with segmented choices.
          </TabsContent>
          <TabsContent value="carry" className="pt-2 text-sm text-muted-foreground">
            Extra layers to bring along.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge variant="primary">Selected</Badge>
          <Badge variant="success">
            <Check />
            Joined
          </Badge>
          <Badge variant="warning">
            <AlertTriangle />
            Check forecast
          </Badge>
          <Badge variant="destructive">
            <CircleAlert />
            Not saved
          </Badge>
          <Badge variant="outline">Invited</Badge>
          <Badge size="sm" variant="outline" className="tabular-nums">
            0.85 clo
          </Badge>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-3">
          <Card>
            <CardHeader>
              <CardTitle>Upper body</CardTitle>
              <CardDescription>One bounded group of content.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">Merino base layer · Light fleece</CardContent>
          </Card>
          <Card variant="muted">
            <CardTitle>Muted</CardTitle>
            <CardDescription>A quiet well inside a surface.</CardDescription>
          </Card>
          <Card variant="selected">
            <CardTitle>Selected</CardTitle>
            <CardDescription>The chosen option in a list of cards.</CardDescription>
          </Card>
          <Card interactive asChild>
            <a href="#overlays">
              <CardTitle>Interactive</CardTitle>
              <CardDescription>The whole card is one link or button.</CardDescription>
            </a>
          </Card>
        </div>
      </Section>
    </div>
  );
}

function OverlayExamples() {
  return (
    <section id="overlays" className="space-y-3 rounded-sheet border border-border bg-card p-4 sm:p-6">
      <h2 className="text-2xl font-semibold">Overlays</h2>
      <p className="text-sm text-muted-foreground">
        Dialogs, drawers, menus and popovers render outside the panels above, so they use the
        app&apos;s appearance. Long drawer content scrolls between a fixed header and footer.
      </p>
      <div className="flex flex-wrap gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename trip</DialogTitle>
              <DialogDescription>Everyone on the trip sees the new name.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label htmlFor="overlay-trip-name" className="text-sm font-medium">
                Trip name
              </label>
              <Input id="overlay-trip-name" defaultValue="Stowe weekend" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>Save</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline">Open drawer</Button>
          </DrawerTrigger>
          <DrawerContent showCloseButton>
            <DrawerHeader className="pr-14">
              <DrawerTitle>Change layer</DrawerTitle>
              <DrawerDescription>Upper body · Mid layer</DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-3 pb-4">
              <div className="space-y-2">
                <label htmlFor="overlay-search" className="text-sm font-medium">
                  Search your wardrobe
                </label>
                <Input id="overlay-search" placeholder="Fleece, puffy, vest..." />
              </div>
              <ul className="divide-y divide-border">
                {Array.from({ length: 14 }, (_, i) => (
                  <li key={i} className="flex min-h-12 items-center justify-between gap-3">
                    <span>Example layer {i + 1}</span>
                    <Badge size="sm" variant="outline" className="tabular-nums">
                      {(0.2 + i * 0.05).toFixed(2)} clo
                    </Badge>
                  </li>
                ))}
              </ul>
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button size="lg">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </section>
  );
}

export function DesignReference() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(3rem+env(safe-area-inset-bottom))] md:px-8">
      <header className="space-y-2">
        <h1 className="text-title font-semibold md:text-title-lg">SWTTR design system</h1>
        <p className="max-w-2xl text-muted-foreground">
          Tokens and shared components in both appearances. The app stays on the dark
          palette until every screen uses these tokens, then follows the system setting.
          See docs/design-system.md for the rules behind these examples.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <PalettePanel appearance="light" />
        <PalettePanel appearance="dark" />
      </div>
      <OverlayExamples />
    </main>
  );
}
