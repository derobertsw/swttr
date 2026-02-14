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
      "SWTTR calculates how much insulation your body needs using the IREQ (Required Clothing Insulation) method from ISO 11079. It models your body's heat balance — metabolic heat production minus heat lost to cold air, wind, and radiation — then solves for the clothing insulation (in clo units) required to maintain a comfortable skin temperature of 33.7\u00b0C. The algorithm accounts for your specific activity's metabolic rate and exertion level, then applies CoWEDA validation-based safety buffers (from published skin-temperature MAE) before selecting garments from your wardrobe.",
  },
  {
    question: "What goes into the calculation?",
    answer:
      "The inputs are temperature, wind speed, your activity type, and your exertion level. From these, the algorithm computes: (1) your metabolic heat output based on activity and effort, (2) respiratory heat losses from breathing cold air, (3) convective heat loss from wind (using the coefficient 8.3 \u00d7 wind\u2070\u00b7\u2076), and (4) radiative heat loss. It iteratively solves for the insulation that keeps skin temperature at the comfort target. The result is a clo target — the total clothing insulation you need.",
  },
  {
    question: "How does exertion level affect recommendations?",
    answer:
      "Each activity has specific metabolic rates for easy, moderate, and hard effort. For example, running moderate is about 6 MET (350 W/m\u00b2) while alpine skiing moderate is 2.5 MET (145 W/m\u00b2). Higher exertion means your body generates more heat, so you need less insulation. This is why XC skiing recommendations are lighter than alpine skiing at the same temperature \u2014 you're producing 2\u20133x more body heat. The algorithm also adjusts metabolic rate based on body size using the DuBois surface area formula.",
  },
  {
    question: "Why are there different targets for torso, arms, and legs?",
    answer:
      "Your body doesn't lose heat evenly. During running, your legs do most of the work and generate more heat, so they need less insulation (torso multiplier: 0.75x, legs: 1.05x). During alpine skiing, your legs are more exposed to cold air on the chairlift (legs: 1.2x). XC skiing puts extra demand on legs too (1.15x). These regional multipliers distribute the whole-body insulation target to where you actually need it.",
  },
  {
    question: "Why do hands and head need special treatment?",
    answer:
      "Extremities lose heat disproportionately fast due to their high surface-area-to-volume ratio and because your body restricts blood flow to them in cold conditions (vasoconstriction). The algorithm applies higher insulation multipliers for extremities \u2014 for alpine skiing, hands need about 1.45x the base insulation and head needs 1.15x. These targets increase further in extreme cold (+2% per degree below -10\u00b0C) and high wind (+3% per m/s), since extremities are more exposed.",
  },
  {
    question: "What is the thermal comfort score?",
    answer:
      "The score (0\u2013100) is a weighted composite of five factors: cold protection, overheat prevention, breathability, weather protection, and weight. The thermal comfort kernel then checks whether your setup is in the target range and whether local body-part deficits are present. A hands/head deficit can force a cold-risk status even when whole-body clo is nominally in range, reflecting CoWEDA's extremity-focused cold-injury risk findings.",
  },
  {
    question: "What are clo values?",
    answer:
      "Clo is a standard unit of thermal resistance for clothing (ISO 9920). 1 clo is the insulation that keeps a resting person comfortable at 21\u00b0C (70\u00b0F) \u2014 roughly a business suit. A thin base layer is about 0.25\u20130.35 clo, a midweight fleece is 0.6\u20131.0 clo, and a heavy insulated jacket can be 1.5+ clo. Importantly, individual garment clo values don't simply add up \u2014 SWTTR uses USARIEM regression equations to predict how layers interact (air gaps, compression), typically yielding 80\u201396% of the simple sum depending on body region.",
  },
  {
    question: "What is the target clo range?",
    answer:
      "The algorithm computes two baselines: the minimum insulation (for a skin temperature of 30\u00b0C \u2014 the cold-stress threshold) and the neutral insulation (for 33.7\u00b0C \u2014 full comfort). The target range is then adjusted based on environmental stress factors (temperature, wind, and exposure planning) and a CoWEDA validation uncertainty buffer derived from published skin-temperature prediction error. This yields a safer practical band, with additional extremity margin for hands/head.",
  },
  {
    question: "How does SWTTR pick garments from my wardrobe?",
    answer:
      "The algorithm builds an ensemble layer by layer. It starts with a base layer (targeting roughly 30% of minimum clo), adds mid-layers and insulation until the regional targets are met, then adds a shell for weather protection. For high-exertion activities like XC skiing, it prioritizes breathable garments (evaporative potential above 0.25) to prevent overheating from trapped sweat. For alpine skiing, it prioritizes warmth and waterproofness. Each garment's actual thermal properties \u2014 regional clo values, breathability, wind/water ratings \u2014 drive the selection, not just generic categories.",
  },
  {
    question: "What activities are supported?",
    answer:
      "The biophysics engine supports Alpine Skiing, Backcountry Skiing (with separate uphill/downhill ensembles), XC Skiing, Running, Biking, and Hiking/Snowshoeing. Each has tuned metabolic rates, regional insulation multipliers, breathability thresholds, and scoring weights. Alpine skiing also uses empirical temperature-bracket targets that blend skiing effort (60%) with chairlift exposure (40%) to account for the stop-and-go nature of resort skiing.",
  },
  {
    question: "What makes backcountry skiing recommendations different?",
    answer:
      "Backcountry skiing generates two separate ensembles: one for the uphill skin (high exertion, ~4 MET moderate) and one for the downhill descent (low exertion, ~2.5 MET). The uphill ensemble prioritizes breathability and lighter insulation since you're generating significant heat, while the downhill ensemble adds warmth for the static, wind-exposed descent. This dual-ensemble approach reflects the reality that you typically add or remove layers at the transition.",
  },
  {
    question: "How does SWTTR handle breathability?",
    answer:
      "The algorithm tracks evaporative resistance (how easily sweat vapor passes through each layer) alongside thermal insulation. It calculates an overall permeability index using the ISO 9920 formula, then derives an evaporative potential (moisture transmission per unit of insulation). For high-exertion activities, garments below the breathability threshold are deprioritized. If overall breathability is below 70% of the target for your activity, you'll see a warning about overheating risk from moisture buildup.",
  },
  {
    question: "What does 'Plan Ahead' do?",
    answer:
      "Plan Ahead lets you get clothing recommendations for a future date and location. Enter a city, select a date and time, and SWTTR fetches the forecast from Open-Meteo and runs the full biophysics calculation against those conditions. Works best within a 7-day window for forecast accuracy.",
  },
  {
    question: "How do I add my gear?",
    answer:
      "Visit the Wardrobe page to search and add calibrated gear from the database. Each item has measured thermal properties: regional clo values, evaporative resistance, wind/water protection ratings, and activity-specific suitability scores. When you get recommendations, SWTTR selects from your wardrobe based on these actual properties rather than generic assumptions.",
  },
  {
    question: "Do I need an account to use SWTTR?",
    answer:
      "No account is required to get clothing recommendations. Your wardrobe is stored locally in your browser. Signing in allows you to sync your wardrobe across devices.",
  },
  {
    question: "Why might recommendations differ from what I'd normally wear?",
    answer:
      "The algorithm is calibrated to standardized thermal comfort research (ISO 11079, USARIEM), which represents average human physiology. Individual variation is real \u2014 some people have higher resting metabolic rates, better cold tolerance, or different body compositions. Use the clo targets as a scientific baseline: if you consistently run cold, aim for the upper end of the target range; if you run hot, the lower end. The regional breakdown helps you see exactly where to add or remove insulation.",
  },
  {
    question: "What temperature unit does SWTTR use?",
    answer:
      "SWTTR displays temperatures in Fahrenheit. Internally, all biophysics calculations use Celsius and m/s (as required by ISO 11079), with conversions handled automatically.",
  },
];

export default function FAQ() {
  return (
    <PageLayout>
      <div className="flex flex-col gap-6 w-full max-w-2xl">
        <header>
          <h2 className="text-2xl font-semibold text-white/90 tracking-wide">
            Frequently Asked Questions
          </h2>
          <p className="text-[13px] text-white/55 mt-1">
            How SWTTR works and how to get the most out of it.
          </p>
        </header>

        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`} className="border-white/20">
              <AccordionTrigger className="text-white/90 text-[15px] leading-snug hover:no-underline hover:text-white">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-white/70 text-[13px] leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </PageLayout>
  );
}
