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
      "SWTTR uses a biophysics-based algorithm grounded in ISO 11079 (IREQ - Required Insulation) standards and USARIEM thermal comfort research. It calculates the exact insulation needed based on temperature, wind speed, humidity, and your activity's metabolic rate. The algorithm considers different insulation needs for body regions (torso, arms, legs) and extremities (hands, head), then selects garments from your wardrobe to meet those targets.",
  },
  {
    question: "What is the thermal comfort score?",
    answer:
      "The score (0-100) indicates how well your recommended outfit matches the calculated insulation requirements. Green (80+) means excellent thermal balance, amber (60-79) is acceptable with minor trade-offs, and red (below 60) suggests potential discomfort. The score factors in thermal insulation, moisture management, wind/water protection, weight, and mobility.",
  },
  {
    question: "What are clo values?",
    answer:
      "Clo is a unit of thermal resistance used to measure clothing insulation. 1 clo equals the insulation needed to keep a resting person comfortable at 21°C (70°F). A t-shirt is about 0.1 clo, while a heavy winter jacket might be 1.5+ clo. SWTTR shows current vs target clo values for each body region so you can see if you're adequately insulated.",
  },
  {
    question: "What activities are supported?",
    answer:
      "SWTTR's biophysics algorithm currently supports Alpine Skiing, Backcountry Skiing, and XC Skiing with activity-specific metabolic rates and regional insulation targets. Running and Biking use simpler temperature-based recommendations.",
  },
  {
    question: "How do I add my gear?",
    answer:
      "Visit the Wardrobe page to add calibrated gear from our database. Search for items by brand or name, and click to add them to your wardrobe. When you get recommendations, SWTTR will select from your wardrobe items based on their actual thermal properties (clo values, breathability, wind/water protection).",
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
      "No account is required to get clothing recommendations. Your wardrobe is stored locally in your browser. Signing in allows you to sync your wardrobe across devices.",
  },
  {
    question: "What temperature unit does SWTTR use?",
    answer:
      "SWTTR currently displays temperatures in Fahrenheit. Support for Celsius is planned for a future update.",
  },
  {
    question: "Why might recommendations differ from what I'd normally wear?",
    answer:
      "The algorithm is based on standardized thermal comfort research, but comfort varies by individual. Some people run hot while others run cold. Use the recommendations as a scientific starting point, then adjust based on your experience. The clo targets help you understand the reasoning behind each suggestion.",
  },
  {
    question: "Why don't hands and head show current clo values?",
    answer:
      "The algorithm calculates target insulation for extremities (hands and head) based on activity and conditions, but we're still building out the handwear and headwear catalog with calibrated thermal data. For now, you'll see the target clo to aim for, and can add items to your wardrobe once they become available. Torso layers show both current and target values since those garments are fully calibrated.",
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
