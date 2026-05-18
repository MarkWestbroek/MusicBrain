///////////////////////////////////////////////////////////
//  Envelope.cpp
//  Implementation of the Class Envelope
//  Created on:      12-mrt-2021 19:58:48
//  Original author: Mark
///////////////////////////////////////////////////////////

#include "Envelope.h"
#include "Arduino.h"
#include "DebugOutput.h"

void Envelope::Initialiseer(){
	mDeb = new DebugOutput (true)
	mResolution = 4096;
	mA = 2050;
	mH = 506;
	mD = 2050;
	mS = 2022;
	mR = 2050;
	mLoop = false;
	mPhase = O;
	mPhaseStart = millis();
	mPhaseTime = 0;
}



Envelope::Envelope(){
	Initialiseer();
}

/*
 * simple ADSR, so no Hold
 */
Envelope::Envelope(int a, int d, int s, int r){
	Initialiseer();
	mA = a;
	mH = 0;
	mD = d;
	mS = s;
	mR = r;
}


Envelope::Envelope(int a, int h, int d, int s, int r){
	Initialiseer();
	mA = a;
	mH = h;
	mD = d;
	mS = s;
	mR = r;
}


Envelope::Envelope(int a, int h, int d, int s, int r, bool loop){
	Initialiseer();
	mA = a;
	mH = h;
	mD = d;
	mS = s;
	mR = r;
	mLoop = loop;
}


Envelope::~Envelope(){

}

void Envelope::SetResolution(int resolution){

	mResolution = resolution;
}


int Envelope::GetResolution(){

	return mResolution;
}


/**
 * Sets attack time in milliseconds
 */
void Envelope::SetAttackTime(const int a){

	mA = a;
}

int Envelope::GetAttackTime(){

	return mA;
}


/**
 * Sets hold time in milliseconds
 */
void Envelope::SetHoldTime(const int h){

	mH = h;
}
int Envelope::GetHoldTime(){

	return mH;
}


/**
 * Sets decay time in milliseconds
 */
void Envelope::SetDecayTime(const int d){

	mD=d;
}
int Envelope::GetDecayTime(){

	return mD;
}


/**
 * Sets sustain level in sample values (depends on resolution)
 */
void Envelope::SetSustainLevel(const int s){

	mS=s;
}
int Envelope::GetSustainLevel(){

	return mS;
}

/**
 * Sets release time in milliseconds, if release where to be from the max level.
 * So release gets shorter when triggered from a lower level, which is always the
 * case except when in the Hold state.
 */
void Envelope::SetReleaseTime(const int r){

	mR=r;
}
int Envelope::GetReleaseTime(){

	return mR;
}


/**
 * Opens the gate, typically: start the attack phase but may be implemented
 * otherwise.  ( D | S | R | 0 ) + GATE OPENS [OR <b>TODO</b> TRIGGER]: A -> H ->
 * D -> S
 */
void Envelope::GateOpen(){

	/*
	( D | S | R | O ) + GATE OPENS [OR TODO TRIGGER]:
	A -> H -> D -> S
	*/
	if (mPhase == O)
	{
		//clean start
		//mPhaseStart = millis();
		//mPhaseTime = 0;
		//mPhase = A;
		NextPhase(); // does all the above
	}
	else if ((mPhase == D) | (mPhase == S) | (mPhase == R) )
	{
		// IF <retrigger> - TODO: make this optional
		// - look up tA that fits to current level (via y = a(t))
		// - make that the virtual start time
		mPhaseTime = GetPhaseTimeFromValue(A);
		mPhaseStart = millis() - mPhaseTime;
		mPhase = A;
	}
}


/**
 * Closes the gate, typically: start the release phase but may be implemented
 * otherwise.  ( A | H | D | S ) + GATE CLOSES:  go to  Release state + remember
 * level when release started 0: no effect
 */
void Envelope::GateClose(){

	if ((mPhase == A) || (mPhase == H) || (mPhase == D) || (mPhase == S))
	{
		mPhase = S; // fake the sustain phase is active now :-)
		// start Release via NextPhase
		NextPhase();
		/* this will do:
		mReleaseStartLevel = mValue; // start with current value
		mPhaseTime = 0;
		mPhase = R;
		*/
	}
}

/**
 * First checks if the current phase is still valid (within the limits of the
 * phase-times).  Then gets the value based on:
 * <ul>
 * <li>the start of the current phase [mPhaseStart]</li>
 * <li>the current time [millis()]</li>
 * <li>the current phase [mPhase]</li>
 * </ul>  OLD Changes Phase if treshold (value) is reached  Tresholds:
 * <ul>
 * <li>A: env >= resolution</li>
 * <li>H: phase-time > holdTime</li>
 * <li>D: env <= sustain level (mS)</li>
 * <li>R: <= 0</li>
 * </ul>
 */
float Envelope::GetValue(){

	/* Gets the current value of the envelope and changes the state if needed
	- first checks if A or H times are exceeded
	- if so: go to next phase
	- gets the value for the current phase
	- checks if decay has reached the sustain level
	- if so: go to next phase
	- checks if release has reached zero
	- if so: go to next phase
	
	- extra: check if attack doesn't go throught the ceiling:
	- if so: limit it and go to the next phase
	
	*/
	
	//the time the phase is active
	mPhaseTime = millis() - mPhaseStart;
	if (mPhase == A && (mPhaseTime >= mA))
	{
		Serial.println("ATTACKTIME ENDED");
		NextPhase();
	}
	if (mPhase == H && (mPhaseTime >= mH))
	{
		Serial.println("HOLDTIME ENDED");
		NextPhase();
	}
	
	// value of the phase is a function of mP
	mValue = GetPhaseValue(mPhase, mPhaseTime);
	
	switch (mPhase)
	{
		case O:
			// do nothing
			break;
		case A:
			if (mValue >= mResolution)
			{
				mDeb.Var("ATTACKVALUE MAX", mValue);
				mValue = mResolution - 1;
				NextPhase();
			}
			break;
		case H:
			// do nothing
			break;
		case D:
			if (mValue <= mS)
			{
				Serial.print("DECAYVALUE <= S = ");
				Serial.println(mValue);

				mValue = mS;
				NextPhase();
			}
			// safety valve
			else if (mValue <= 0)
			{
				mValue = 0;
				// go to release and then further
				mPhase = R;
				NextPhase();	
			}
			break;
		case S:
			// do nothing
			break;
		case R:
			if (mValue <= 0)
			{
				Serial.print("RELEASEVALUE <= 0 = ");
				Serial.println(mValue);

				mValue = 0;
				NextPhase();
			}
			break;
	}
	
	// TODO: optional limiter (to be sure and not get weird effects of the DAC)
	
	return mValue;
}


/**
 * Gets the current phase
 */
Phase Envelope::GetPhase(){

	return mPhase;
}

/**
 * Gets the current phase's name
 */
String Envelope::GetPhaseName(){
	return mPhaseName[mPhase];
}

long Envelope::GetPhaseStart(){
	return mPhaseStart;
}

long Envelope::GetPhaseTime(){
	return mPhaseTime;
}

void Envelope::SetLoop(bool loop){

	mLoop = loop;
}


/**
 * Goes to the next phase. If loop == true: loops from R to A. Called by
 * <ul>
 * <li>GetValue reaching a treshold or time limit</li>
 * <li>GateClose</li>
 * </ul> Or other functions if otherwise implemented (e.g. loop).
 * <ul>
 * <li>A -> (if holdtime) -> H</li>
 * <li>H -> D</li>
 * <li>D -> S</li>
 * <li>S -> R</li>
 * <li>R -> 0 or (if loop) -> A</li>
 * </ul>
 */
Phase Envelope::NextPhase(){

	switch (mPhase)
	{
		case O: // we consider not doing anything a phase,the 'zero-phase'
			mPhase = A;
			break;
		case A:
			if (mH > 0){
				mPhase = H;
			}
			else
			{
				mPhase = D;
			}
			break;
		case H:
			mPhase = D;
			break;
		case D:
			mPhase = S;
			break;
		case S:
			mReleaseStartLevel = mValue; // always start release with current value
			mPhase = R;
			break;
		case R:
			if (mLoop)
			{
				mPhase = A;
			}
			else
			{
				mPhase = O;
			}
			break;	
	}
	mPhaseStart = millis();
	mPhaseTime = 0;
	return mPhase;
}


/**
 * Depending on the phase, get the value.  Each phase employs a function. (tA =
 * attack time, member:  mA, etc tS = sustain time, in case sustain falls off
 * slowly S = sustain level = member mS )
 * <ul>
 * <li>Attack:    y = a (t / Ta) -> linear: y = resolution * t / Ta</li>
 * <li>Hold:       y = h (t/ Th) -> linear:  Th is infinite, so y = resolution-
 * 1</li>
 * <li>Decay:     y = d (t/ Td)  -> linear: y = resolution  - resolution * t /
 * Td</li>
 * <li>Sustain:  y =  s (t / Ts) -> linear: Ts is infinite, so  y = S</li>
 * <li>Release: y = r (t / Tr)  -> linear: y = S - resolution * t / Tr</li>
 * <li>No Phase: y = 0 </li>
 * </ul>
 */
float Envelope::GetPhaseValue(Phase phase, long t){

	switch (phase)
	{
		case O:
			return 0;
			break;
		case A:
			return mResolution * t / mA;
			break;
		case H:
			return mResolution - 1;
			break;
		case D:
			return mResolution - 1 - mResolution * t / mD;
			break;
		case S:
			return mS;
			break;
		case R:
			return mReleaseStartLevel - mResolution * t / mR;
			break;
	}
	return 0;
}


/**
 * Gets the time of this phase from the current value = reverse function of
 * GetPhaseValue(t).  Just works for Attack: Attack:    y = a (t / Ta) -> linear:
 * y = resolution * t / Ta  So inverse: t = y * Ta / resolution
 */
long Envelope::GetPhaseTimeFromValue(Phase phase){
	long returnvalue;
	if (phase == A)
	{
		returnvalue = mValue * mA / mResolution;
	}
	else
	{
		returnvalue = 0;
	}
	return returnvalue;
}
