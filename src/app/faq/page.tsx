"use client";

import PageLayout from "@/components/PageLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How does SWTTR determine what to wear?",
    answer:
      "SWTTR uses temperature ranges and activity type to recommend layering strategies. The recommendations are based on best practices for outdoor activities, accounting for factors like exertion level and wind exposure.",
  },
  {
    question: "What activities are supported?",
    answer:
      "Currently SWTTR supports Alpine Skiing, Backcountry Skiing, XC Skiing, Running, and Biking. Each activity has tailored recommendations based on typical exertion levels and conditions.",
  },
  {
    question: "How do I customize my gear names?",
    answer:
      "Visit the Wardrobe page to replace standard layer names with your actual gear. For example, you can change 'Midweight base layer' to 'Patagonia Capilene'. These custom names will appear in your recommendations.",
  },
  {
    question: "What does 'Plan Ahead' do?",
    answer:
      "Plan Ahead lets you get clothing recommendations for a future date and location. Enter a city, select a date and time, and SWTTR will fetch the weather forecast and provide appropriate recommendations.",
  },
  {
    question: "How accurate are the weather forecasts?",
    answer:
      "SWTTR uses Open-Meteo for weather data, which provides reliable forecasts. For best accuracy, plan ahead recommendations work best within a 7-day window.",
  },
  {
    question: "Do I need an account to use SWTTR?",
    answer:
      "No account is required to get clothing recommendations. However, signing in allows you to save your custom gear names across devices and sessions.",
  },
  {
    question: "What temperature unit does SWTTR use?",
    answer:
      "SWTTR currently displays temperatures in Fahrenheit. Support for Celsius is planned for a future update.",
  },
  {
    question: "Why are some layers optional?",
    answer:
      "Comfort varies by individual. Some people run hot while others run cold. The recommendations provide a starting point, but you should adjust based on your personal preferences and experience.",
  },
];

export default function FAQ() {
  return (
    <PageLayout>
      <div className="flex flex-col gap-6 w-full max-w-2xl">
        <header>
          <h2 className="text-2xl font-semibold">Frequently Asked Questions</h2>
          <p className="text-muted-foreground">
            Common questions about using SWTTR.
          </p>
        </header>

        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger>{faq.question}</AccordionTrigger>
              <AccordionContent>{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </PageLayout>
  );
}
