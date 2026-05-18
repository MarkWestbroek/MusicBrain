/**********************************************
AHDSR using:
* MCP4725 12 bit I2C DAC (breakout board)
* Wire
* Envelope class
* LED and Serial for debugging
************************************************/

#include "Arduino.h"
#include "Wire.h"  //Include the Wire library to talk I2C

#include "Global.h"
#include "Phase.h"
#include "EnvelopeController.h"
#include "SessionDebugOutput.h"

// GLOBAL
Global global = Global(All);

// DEBUG
short de = 1;
SessionDebugOutput deb = SessionDebugOutput();
char Ph[] = {'Z','A','H','D','S','R'}; // for debugging
int debugValueInterval = 100; //in ms
int pht; // nr of ms current phase is active
int det; // time last debugged

//This is the I2C Address of the MCP4725, by default (A0 pulled to GND).
//Please note that this breakout is for the MCP4725A0.
#define MCP4725_ADDR 0x62
//0x60
//For devices with A0 pulled HIGH, use 0x61

const int buttonPin = 3;     // the number of the pushbutton pin
int buttonState = 0;         // variable for reading the pushbutton status

String t;

int pot1Pin = A0; // potentiometer wiper (middle terminal) connected to analog pin 0 - outside leads to ground and +5V
int pot1 = 0;  // variable to store the value read
int p1 = 0; // downrounded pot1/20
int p1o = -1; // same but value in previous loop

// ENVELOPE
int res = 4096; // sample resolution
bool gate = false; // the gate state
bool previousGate = false;
int env = 0; // the envelope value

// default (start) values for the envelope
int a = 1000;
int h = 200;
int d = 1000;
int s = 2018;
int r = 2000;

EnvelopeController envelope (a,h,d,s,r); // the envelope object

Phase currentPhase = O;
Phase previousPhase = O;


//for testing
int loopcount = 0;


void setup()
{
  Serial.begin(9600);           //  setup serial
  Wire.begin();

  // initialize digital pin LED_BUILTIN as an output.
  pinMode(LED_BUILTIN, OUTPUT);

  // initialize the pushbutton pin as an input:
  pinMode(buttonPin, INPUT);

  envelope.SetResolution(res);

  deb.Var("Phase", envelope.GetPhase());
  deb.Var("PhaseName", envelope.GetPhaseName());
  deb.Var("A", envelope.GetAttackTime());
  deb.Var("H", envelope.GetHoldTime());
  deb.Var("D", envelope.GetDecayTime());
  deb.Var("S", envelope.GetSustainLevel());
  deb.Var("R", envelope.GetReleaseTime());


}
//---------------------------------------------------
void loop()
{
  loopcount++;

  // read the state of the pushbutton value:
  buttonState = digitalRead(buttonPin);
  //Serial.println(buttonState);          // debug value

  // check if the pushbutton is pressed. If it is, the buttonState is HIGH:
  if (buttonState == HIGH) {
    gate = true;
  } else {
    gate = false;
  }

  // show gate in the LED
  if(gate){
    digitalWrite(LED_BUILTIN, HIGH);   // turn the LED on (HIGH is the voltage level)
  }
  else
  {
    digitalWrite(LED_BUILTIN, LOW);    // turn the LED off by making the voltage LOW
  }

  // check pots and adjust values
  pot1 = analogRead(pot1Pin)+1; //+1 as we may want to divide by this value...
  p1 = pot1/10;

  //check if pot1 has changed, if so , recalculate incA
  if (p1 != p1o){
    p1o = p1;
    /*
    Serial.print("pot1=");
    Serial.print(pot1);
    Serial.print("\t");
    Serial.print("p1=");
    Serial.print(p1);
    Serial.print("\t");
    Serial.print("incA=");
    Serial.println(incA);
    */
  }

  /*
  if (pot2 ! pot2old){
    //decD = ....
  }
  */

  // Gate changed?
  if (previousGate != gate)
  {
    previousGate = gate;
    if (gate){
      Serial.print("Gate to open - phase is: ");
      Serial.println(envelope.GetPhaseName());
      envelope.GateOpen();
      Serial.print("Gate opened - phase is: ");
      Serial.println(envelope.GetPhaseName());

    }
    else
    {
      Serial.print("Gate to close - phase is: ");
      Serial.println(envelope.GetPhaseName());
      envelope.GateClose();
      Serial.print("Gate closed - phase is: ");
      Serial.println(envelope.GetPhaseName());
    }
  }

  // GET THE VALUE
  env = envelope.GetValue();

  currentPhase = envelope.GetPhase();

  // Phase changed?
  if (previousPhase != currentPhase)
  {
    if (de==2){
      //debug
      t= "\telapsed\t";
      t+= (millis() - envelope.GetPhaseStart());
      t+= "\t ms\t value\t";
      t+= env;
      t+= "\t looped\t";
      t+= loopcount;
      t+= "\t times";
      Serial.println(t);
      Serial.print(envelope.GetPhaseName());
    }
    Serial.print("Phase: ");
    Serial.println(envelope.GetPhaseName());
    if ( currentPhase == H){
        Serial.print("H = ");
        Serial.println(envelope.GetHoldTime());
      }

    previousPhase = currentPhase;
    loopcount = 0;
  }

  // DEBUG every 200ms the value
  pht = millis() - envelope.GetPhaseStart();
  //print every debugValueInterval ms (default 200)
  if ( (pht%debugValueInterval)<5)
  {
    if (det/debugValueInterval != pht/debugValueInterval) // not already debugprinted
    {
      det = pht;
      Serial.print(pht);
      Serial.print(" ms - value = ");
      Serial.print(env);
      Serial.print(" - H = ");
      Serial.println(envelope.GetHoldTime());
    }
  }

  // for Plot
  // Serial.println(env);

  // send current envelope value
  Wire.beginTransmission(MCP4725_ADDR);
  Wire.write(64);                     // cmd to update the DAC
  Wire.write(env >> 4);        // the 8 most significant bits...
  Wire.write((env & 15) << 4); // the 4 least significant bits...
  Wire.endTransmission();
}
