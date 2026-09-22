#pragma once
/**
 * @file UsbQueueProbe.h
 * @brief Laat de USB-audio het tempo van de audiocyclus bepalen, en meet de
 *        USB-zendwachtrij.
 * @details
 * Waarom: AudioOutputUSB houdt maar twee blokken van 128 samples vast en de pc
 * haalt er elke milliseconde 44 of 45 af, op de klok van de pc. De Teensy-
 * core start de audiocyclus zonder audiochip op een eigen timer (2902 us,
 * kristal van de Teensy). Waar de wachtrij tussen die twee klokken komt te
 * liggen is toeval bij het opstarten; lag hij tegen de bovenrand (gemeten:
 * 84..128 van de 128 vrije plekken), dan gooide de core bij de kleinste
 * vertraging aan de USB-kant een heel blok weg: een sprong in de golfvorm,
 * een tik. De MS-20 in de sampler (~50% CPU) gaf zo 5 tikken per seconde,
 * zonder filter bijna nooit.
 *
 * De oplossing: wij nemen de update-verantwoordelijkheid over voor
 * AudioMemory() (dan start de core zijn eigen timer niet). Een kleine timer
 * kijkt elke 1/16 blok naar de wachtrij en start een audiocyclus zodra er
 * hoogstens kLowWater samples in staan. Zo blijft de wachtrij in het midden
 * (nooit een blok erbij terwijl er al twee staan, nooit leeg), en volgt de
 * samplerate precies de pc, zoals een USB-audioapparaat hoort te doen. Speelt
 * de pc geen audio af (stream dicht), dan loopt de cyclus vrij op 2902 us,
 * zoals voorheen.
 *
 * Twee probes in de update-lijst: Before (vlak voor usbOut) meet de wachtrij
 * voordat usbOut zijn blok erop zet; After (vlak na usbOut) meldt dat het blok
 * erop staat, zodat de timer niet twee cycli voor dezelfde behoefte start.
 * Tellers worden in het status-bericht uitgelezen en daarna op nul gezet.
 *
 * NB: met een echte audiochip (I2S) neemt die de verantwoordelijkheid; dan
 * startPacer() niet aanroepen.
 */
#include <Arduino.h>
#include <AudioStream.h>
#include <IntervalTimer.h>

class UsbQueueProbe : public AudioStream {
public:
    enum class Role : uint8_t { Before, After };
    explicit UsbQueueProbe(Role role) : AudioStream(0, nullptr), role_(role) {
        // Zonder kabels zet de core een stream niet actief; deze moet toch draaien.
        active = true;
    }
    void update() override;

    /** Neem de update-verantwoordelijkheid en start de pacer. Voor AudioMemory(). */
    static void startPacer();

    struct Stats {
        uint32_t cycles = 0, overruns = 0, underruns = 0, paced = 0, freeRun = 0;
        int fillMin = 1 << 30, fillMax = -1;
        uint32_t periodMinUs = 1u << 30, periodMaxUs = 0;
    };
    /** Tellers sinds de vorige take(); zet ze op nul. */
    static Stats take();

    /** Start een cyclus zodra er hoogstens zoveel samples in de wachtrij staan. */
    static constexpr int kLowWater = 96;

private:
    static void pace();
    static void kick(uint32_t now);

    Role role_;
    static Stats s_;
    static uint32_t lastCycle_;
    static volatile bool requested_;
    static volatile uint32_t lastKick_;
    static IntervalTimer timer_;
};

/** Vulling van de USB-zendwachtrij in samples, en of blok 1/2 bezet is. */
int usbTxQueueFill(bool& first, bool& second);
