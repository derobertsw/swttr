import { ReactNode } from "react";
import Header from "@/components/Header";

interface PageLayoutProps {
  children: ReactNode;
  onLogoClick?: () => void;
}

const PageLayout = ({ children, onLogoClick }: PageLayoutProps) => {
  return (
    <div className="font-sans flex flex-col min-h-screen p-4 pb-20 gap-8 sm:p-8 md:p-20 md:gap-16">
      <Header onLogoClick={onLogoClick} />
      <main className="flex flex-col gap-6 sm:gap-8 flex-1 items-center sm:items-start w-full">
        {children}
      </main>
      <footer className="flex gap-6 flex-wrap items-center justify-center mt-auto">
        <a
          className="hover:underline hover:underline-offset-4"
          href="https://docs.google.com/forms/d/e/1FAIpQLSfpX2tVx485Q0ybdNH_t48_-Z_WY0ldx3VhhkUeGKIXQ2N9fg/viewform?usp=publish-editor"
          target="_blank"
          rel="noopener noreferrer"
        >
          Provide Feedback
        </a>
      </footer>
    </div>
  );
};

export default PageLayout;
