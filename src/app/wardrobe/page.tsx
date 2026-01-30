"use client";

import { useState, useEffect } from "react";
import PageLayout from "@/components/PageLayout";
import { ItemMappingEditor, useItemMappings } from "@/components/wardrobe";

const Wardrobe = () => {
  const [userId, setUserId] = useState<string | null>(null);

  const {
    mappings,
    loading,
    updateMapping,
    deleteMapping,
  } = useItemMappings(userId);

  useEffect(() => {
    let storedUserId = localStorage.getItem("swttr-user-id");
    if (!storedUserId) {
      storedUserId = `user-${crypto.randomUUID()}`;
      localStorage.setItem("swttr-user-id", storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  return (
    <PageLayout>
      <div className="flex flex-col gap-4 sm:gap-6 w-full max-w-2xl">
        <div>
          <h2 className="text-2xl font-semibold">My Gear</h2>
          <p className="text-muted-foreground">
            Replace standard layer names with your actual gear. These names will
            appear in your recommendations.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        ) : (
          <ItemMappingEditor
            userId={userId}
            mappings={mappings}
            onUpdate={updateMapping}
            onDelete={deleteMapping}
          />
        )}
      </div>
    </PageLayout>
  );
};

export default Wardrobe;
