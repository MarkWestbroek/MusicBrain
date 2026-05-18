///////////////////////////////////////////////////////////
//  Envelope.h
//  Implementation of the Class Envelope
//  Created on:      12-mrt-2021 19:58:48
//  Original author: Mark
///////////////////////////////////////////////////////////

#if !defined(EA_1D53BA11_EF74_4268_8485_7D9BA44561B8__INCLUDED_)
#define EA_1D53BA11_EF74_4268_8485_7D9BA44561B8__INCLUDED_

#include "Phase.h"
#include "Arduino.h"
#include "Global.h"
#include "Channel.h"
#include "SessionDebugOutput.h"

/**
 * <b>( D | S | R | 0 ) + GATE OPENS [OR TODO TRIGGER]: ->  A -> H -> D -> S</b>
 * <b>( A | H | D | S ) + GATE CLOSES: ->  R -> 0</b>  <b>or -> A if loop ==
 * true</b>
 * 
 * Each phase employs a <b>function</b>.
 * <i>(tA = attack time, member:  mA, etc</i>
 * <i>tS = sustain time, in case sustain falls off slowly</i>
 * <i>S = sustain level = member mS )</i>
 * <ul>
 * 	<li>Attack:    y = a (t / Ta) -> linear: y = resolution * t / Ta</li>
 * 	<li>Hold:       y = h (t/ Th) -> linear:  Th is infinite, so y =
 * resolution</li>
 * 	<li>Decay:     y = d (t/ Td)  -> linear: y = resolution  - resolution * t /
 * Td</li>
 * 	<li>Sustain:  y =  s (t / Ts) -> linear: Ts is infinite, so  y = S</li>
 * 	<li>Release: y = r (t / Tr)  -> linear: y = S - resolution * t / Tr</li>
 * 	<li>No Phase: y = 0</li>
 * </ul>
 */
class EnvelopeController
{

public:
	void Initialiseer();
	EnvelopeController();
	EnvelopeController(int a, int d, int s, int r);
	EnvelopeController(int a, int h, int d, int s, int r);
	EnvelopeController(int a, int h, int d, int s, int r, bool loop);
	virtual ~EnvelopeController();
	void SetResolution(int resolution);
	int GetResolution();
	void SetAttackTime(const int a);
	int GetAttackTime();
	void SetHoldTime(const int h);
	int GetHoldTime();
	void SetDecayTime(const int d);
	int GetDecayTime();
	void SetSustainLevel(const int s);
	int GetSustainLevel();
	void SetReleaseTime(const int r);
	int GetReleaseTime();
	void GateOpen();
	void GateClose();
	float GetValue();
	Phase GetPhase();
	String GetPhaseName();
	long GetPhaseStart();
	long GetPhaseTime();
	void SetLoop(bool loop);

protected:
	Global *m_Global;
	SessionDebugOutput mDebugOutput;
	Phase NextPhase();
	float GetPhaseValue(Phase phase, long t);
	long GetPhaseTimeFromValue(Phase phase);

private:
	/**
	 * Attack time in milliseconds
	 */
	int mA;
	int mH;
	int mD;
	int mS;
	int mR;
	bool mLoop;
	long mStartTime;
	/**
	 * The current phase
	 */
	Phase mPhase;
	const char* mPhaseName[6] = {"ZERO", "ATTACK", "HOLD", "DECAY", "SUSTAIN", "RELEASE"};
	int mResolution;
	/**
	 * The start of the current phase (ms from millis() ).
	 */
	long mPhaseStart;
	long mPhaseTime;
	/**
	 * The value of the envelope when release started.
	 */
	int mReleaseStartLevel;
	/**
	 * The current envelope value
	 */
	float mValue;

};
#endif // !defined(EA_1D53BA11_EF74_4268_8485_7D9BA44561B8__INCLUDED_)
