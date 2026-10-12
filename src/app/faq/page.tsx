"use client";

import { useTemperatureUnit } from "@/components/TemperatureUnitProvider";
import { formatTemperature } from "@/lib/temperature";
import type { TemperatureUnit } from "@/types/preferences";
import PageLayout from "@/components/PageLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface Faq {
  question: string;
  answer: string;
}

// Answers describe what the app does today; check them against the code when it changes.
const USING_SWTTR: Faq[] = [
  {
    question: "Do I need an account to use SWTTR?",
    answer:
      "No. Without one, Gear up gives general layers for the temperature for Alpine Skiing, XC Skiing and Hiking / Snowshoeing, including multi-day plans and their packing lists. Signing in adds one-day layers worked out from your body and the gear you own, in every activity except Hiking / Snowshoeing, plus your wardrobe, packing lists matched to it, and trips. Nothing has to be set up first: add gear when you want layers built from it, and height and weight in Settings are optional. If you sign in from an outing's results, you come back to that outing.",
  },
  {
    question: "Which activities get which advice?",
    answer:
      "Layers worked out from your body and the gear you own: Alpine Skiing, Backcountry Skiing, XC Skiing, Running and Biking, for a one-day outing when you're signed in. Backcountry Skiing gets separate layers for the climb and the descent. General layers for the temperature: Alpine Skiing, XC Skiing and Hiking / Snowshoeing, signed in or not, including multi-day plans. Hiking / Snowshoeing has no model for your body and gear yet, so it always gets general layers. Running, Biking and Backcountry Skiing have no general layers, so when you're signed out, and in multi-day plans, they show the weather without layers.",
  },
  {
    question: "Can I plan for a later day or a multi-day trip?",
    answer:
      "Yes. On Gear up, choose Later, then pick a start date and time at the place you're going. A one-day outing gets the same kind of advice as Now, for the forecast at that hour. Choose Several days for a plan of two to seven days. For Alpine Skiing, XC Skiing and Hiking / Snowshoeing, each day gets general layers for its morning, midday and evening, between 6 am and 9 pm, and the plan comes with one packing list; Running, Biking and Backcountry Skiing get each day's weather without layers. Those layers come from the forecast temperature whether or not you're signed in; signing in matches the packing list to your wardrobe. Dates are limited to what the forecast covers, about two weeks ahead.",
  },
  {
    question: "How do I add my gear?",
    answer:
      "Sign in, open Wardrobe and search the catalog. Each catalog item's details show how its warmth was worked out (lab tested, derived from a similar garment, or calculated from its materials) and how confident that figure is. If the catalog doesn't have something, add a custom item: pick what it's most like and SWTTR estimates its warmth, labeled as an estimate. Layers worked out for you come only from gear you own and haven't excluded, and excluding an item applies everywhere on your account. Choosing a suggested item for an outfit doesn't add it to your wardrobe; only I own this does.",
  },
  {
    question: "Why might recommendations differ from what I'd normally wear?",
    answer:
      "The algorithm is calibrated to standardized thermal comfort research (ISO 11079, USARIEM), which represents average human physiology. Individual variation is real — some people have higher resting metabolic rates, better cold tolerance, or different body compositions. Run Warm and Run Cold in Settings shift general layers and multi-day plans; they don't change layers worked out from your body and gear yet. For those, use the clo targets as a baseline: if you consistently run cold, aim for the upper end of the target range; if you run hot, the lower end. The regional breakdown helps you see exactly where to add or remove insulation.",
  },
  {
    question: "What temperature unit does SWTTR use?",
    answer:
      "Choose Fahrenheit or Celsius in Settings. The choice is saved for your account on this device, with a separate choice when signed out. US locales default to Fahrenheit; other locales default to Celsius. Internally, all biophysics calculations use Celsius and m/s (as required by ISO 11079), with conversions handled automatically.",
  },
];

const getHowItWorks = (temperatureUnit: TemperatureUnit): Faq[] => [
  {
    question: "How does SWTTR determine what to wear?",
    answer:
      `For the activities it models, SWTTR calculates how much insulation your body needs using the IREQ (Required Clothing Insulation) method from ISO 11079. It models your body's heat balance — metabolic heat production minus heat lost to cold air, wind, and radiation — then solves for the clothing insulation (in clo units) required to maintain a comfortable skin temperature of ${formatTemperature(92.66, temperatureUnit, 1)}. The algorithm accounts for your activity's metabolic rate and exertion level, adds a safety margin inspired by CoWEDA's published skin-temperature errors, then selects garments from your wardrobe. That margin is SWTTR's own assumption, not a validated safety bound.`,
  },
  {
    question: "What goes into the calculation?",
    answer:
      "The inputs are temperature, wind speed, humidity, whether it's raining or snowing, your activity and exertion level, and your height and weight when you've set them (otherwise 69 in and 170 lb). From these, the algorithm computes: (1) your metabolic heat output based on activity, effort and body size, (2) respiratory heat losses from breathing cold air, (3) convective heat loss from wind (using the coefficient 8.3 × wind⁰·⁶), and (4) radiative heat loss. It iteratively solves for the insulation that keeps skin temperature at the comfort target. The result is a clo target — the total clothing insulation you need.",
  },
  {
    question: "How does exertion level affect recommendations?",
    answer:
      "Each activity has its own metabolic rates for easy, moderate, and hard effort. Running and XC skiing follow the 2024 Adult Compendium of Physical Activities: about 6.5 MET easy, 8.5 MET moderate and 11 MET hard. Alpine skiing at a moderate effort is about 2.5 MET, and a chairlift ride about 1.2 MET. Higher exertion means your body generates more heat, so you need less insulation. This is why XC skiing recommendations are lighter than alpine skiing at the same temperature — you're producing more than three times as much body heat. Running and XC skiing convert MET to heat from your weight and body surface area (the DuBois formula); other activities adjust a reference rate for body size. Alpine skiing blends the run and the chairlift ride: its minimum weighs skiing 60% and the chairlift 40%, and its comfortable end follows the colder chairlift.",
  },
  {
    question: "Why are there different targets for torso, arms, and legs?",
    answer:
      "Your body doesn't lose heat evenly. During running, your core runs hot from the sustained effort, so the torso needs less insulation (0.75x) while the legs, out in the airflow, need a little more (1.05x). During alpine skiing, your legs are more exposed to cold air on the chairlift (legs: 1.2x). XC skiing puts extra demand on legs too (1.15x). These regional multipliers are rescaled so they average back to the whole-body target, distributing it to where you actually need it.",
  },
  {
    question: "Why do hands and head need special treatment?",
    answer:
      `Extremities lose heat disproportionately fast due to their high surface-area-to-volume ratio and because your body restricts blood flow to them in cold conditions (vasoconstriction). The algorithm applies higher insulation multipliers for extremities — for alpine skiing, hands need about 1.45x the base insulation and head needs 1.15x. These targets are eased by up to 20% in milder cold: they rise 2% per °C from ${formatTemperature(32, temperatureUnit)} down to ${formatTemperature(14, temperatureUnit)}, and are at full strength below that. Wind adds 3% per m/s, since extremities are more exposed.`,
  },
  {
    question: "What is the thermal comfort score?",
    answer:
      "The score (0–100) is a weighted composite of five factors: cold protection, overheat prevention, breathability, weather protection, and weight. The thermal comfort kernel then checks whether your setup is in the target range and whether local body-part deficits are present. A hands/head deficit can force a cold-risk status even when whole-body clo is nominally in range, reflecting CoWEDA's extremity-focused cold-injury risk findings.",
  },
  {
    question: "What are clo values?",
    answer:
      `Clo is a standard unit of thermal resistance for clothing (ISO 9920). 1 clo is the insulation that keeps a resting person comfortable at ${formatTemperature(69.8, temperatureUnit, 1)} — roughly a business suit. A thin base layer is about 0.25–0.35 clo, a midweight fleece is 0.6–1.0 clo, and a heavy insulated jacket can be 1.5+ clo. Importantly, individual garment clo values don't simply add up — SWTTR uses USARIEM regression equations to predict how layers interact (air gaps, compression), typically yielding 80–96% of the simple sum depending on body region.`,
  },
  {
    question: "What is the target clo range?",
    answer:
      `The algorithm computes two baselines: the minimum insulation (for a skin temperature of ${formatTemperature(86, temperatureUnit)} — the cold-stress threshold) and the neutral insulation (for ${formatTemperature(92.66, temperatureUnit, 1)} — full comfort). The target range is then adjusted based on environmental stress factors (temperature, wind, and exposure planning) and a margin inspired by CoWEDA's published skin-temperature prediction error. The margin is SWTTR's assumption rather than a validated bound; for running and XC skiing it tapers off in mild, dry, calm weather. Hands and head get an additional margin.`,
  },
  {
    question: "How does SWTTR pick garments from my wardrobe?",
    answer:
      "It builds an outfit from the gear you own. Alpine and XC skiing compare complete combinations of a base layer, an optional mid layer or puffy, and an outer layer for each body region, and choose the one with the least shortfall below the minimum and excess above the comfortable target. Other activities pick a base layer, then mid layers, then a shell. For high-exertion activities like running and XC skiing, it favors breathable garments to prevent overheating from trapped sweat. For alpine skiing, it prioritizes warmth and keeps rain protection. Each garment's actual thermal properties — regional clo values, breathability, wind/water ratings — drive the selection, not just generic categories.",
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
];

function FaqSection({ id, title, faqs }: { id: string; title: string; faqs: Faq[] }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-lg font-semibold text-foreground">
        {title}
      </h2>
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq) => (
          <AccordionItem key={faq.question} value={faq.question}>
            <AccordionTrigger className="text-foreground hover:no-underline hover:text-primary">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

export default function FAQ() {
  const { temperatureUnit } = useTemperatureUnit();
  return (
    <PageLayout>
      <div className="flex flex-col gap-6 w-full max-w-2xl">
        <header>
          <h1 className="text-title font-semibold text-foreground md:text-title-lg">
            Frequently Asked Questions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How SWTTR works and how to get the most out of it.
          </p>
        </header>

        <FaqSection id="faq-using" title="Using SWTTR" faqs={USING_SWTTR} />
        <FaqSection id="faq-how-it-works" title="How the advice is worked out" faqs={getHowItWorks(temperatureUnit)} />
      </div>
    </PageLayout>
  );
}
