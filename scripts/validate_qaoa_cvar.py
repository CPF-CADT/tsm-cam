"""Reproduce CVaR and feasibility-preserving QAOA experiments.
All trials use 9 qubits and 1,024 shots per objective evaluation/final sample.
The exact benchmark is computed after sampling and never used for selection.
"""
import os
os.environ['MPLCONFIGDIR']='/tmp/tsm-mpl-cache'
import sys,json,time,itertools
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PROJECT_ROOT))
import numpy as np
from app.classical.locations import build_straight_distance_matrix
from qiskit import transpile
from qiskit.transpiler import generate_preset_pass_manager
from qiskit_aer import AerSimulator
from qiskit_aer.primitives import SamplerV2
from qiskit_optimization import QuadraticProgram
from qiskit_optimization.converters import QuadraticProgramToQubo
from qiskit_optimization.translators import to_ising
from qiskit_optimization.minimum_eigensolvers import QAOA
from qiskit_algorithms.optimizers import COBYLA
root=PROJECT_ROOT
names=['Phnom Penh','Takeo','Kampong Cham','Siem Reap']
pins=json.loads((root/'static/data/provinces.json').read_text())
loc=[next(p for p in pins if p['name']==name) for name in names]
d=np.array(build_straight_distance_matrix(loc)['distances'])

def build(reduced,closed):
 n=len(d);m=n-1 if reduced else n
 w=d/d.max()
 qp=QuadraticProgram()
 for i in range(m):
  for p in range(m):qp.binary_var(name=f'x_{i}_{p}')
 linear={};quad={}
 for i in range(m):
  city=i+1 if reduced else i
  if reduced:
   linear[f'x_{i}_0']=float(w[0,city])
   if closed:linear[f'x_{i}_{m-1}']=float(w[city,0])
 for p in range(m-1):
  for i in range(m):
   for j in range(m):
    if i!=j:quad[(f'x_{i}_{p}',f'x_{j}_{p+1}')]=float(w[i+1 if reduced else i,j+1 if reduced else j])
 if closed and not reduced:
  for i in range(m):
   for j in range(m):
    if i!=j:quad[(f'x_{i}_{m-1}',f'x_{j}_0')]=float(w[i,j])
 qp.minimize(linear=linear,quadratic=quad)
 for i in range(m):qp.linear_constraint({f'x_{i}_{p}':1 for p in range(m)},'==',1,f'city_{i}')
 for p in range(m):qp.linear_constraint({f'x_{i}_{p}':1 for i in range(m)},'==',1,f'position_{p}')
 if not reduced and not closed:qp.linear_constraint({'x_0_0':1},'==',1,'depot')
 qubo=QuadraticProgramToQubo(penalty=4.0).convert(qp)
 h,offset=to_ising(qubo)
 return qp,qubo,h,offset,m

def decode(s,m,reduced,closed):
 a=np.array([int(x) for x in s[::-1]]).reshape(m,m)
 if not(np.all(a.sum(0)==1) and np.all(a.sum(1)==1)):return None
 route=[int(np.argmax(a[:,p]))+(1 if reduced else 0) for p in range(m)]
 if reduced:route=[0]+route
 elif closed:
  start=route.index(0);route=route[start:]+route[:start]
 elif route[0]!=0:return None
 return route+[0] if closed else route

def distance(route):return float(sum(d[a,b] for a,b in zip(route,route[1:])))


def main():
    results=[]
    for alpha,p,budget in [(1.0,2,100),(0.1,2,100),(0.1,3,200),(0.25,3,200)]:
     for closed in [True,False]:
      _,_,h,_,m=build(True,closed)
      for seed in [7,21,42,101,202]:
       backend=AerSimulator(max_parallel_threads=4)
       sampler=SamplerV2(default_shots=1024,seed=seed,options={'backend_options':{'max_parallel_threads':4}})
       log=[]
       solver=QAOA(sampler=sampler,optimizer=COBYLA(maxiter=budget,tol=1e-4),reps=p,
           aggregation=alpha,initial_point=np.full(2*p,0.2),
           pass_manager=generate_preset_pass_manager(backend=backend,optimization_level=1),
           callback=lambda i,params,mean,meta:log.append(float(np.real(mean))))
       fit=solver.compute_minimum_eigenvalue(h)
       circ=solver.ansatz.remove_final_measurements(inplace=False).assign_parameters(fit.optimal_point)
       circ.measure_all()
       counts=backend.run(transpile(circ,backend,seed_transpiler=seed),shots=1024,seed_simulator=seed).result().get_counts()
       top=max(counts,key=counts.get)
       toproute=decode(top,m,True,closed)
       valid=[(s,c,decode(s,m,True,closed)) for s,c in counts.items() if decode(s,m,True,closed) is not None]
       # Evaluate exact benchmark only after the mode and measurements have been fixed.
       optimum=min(distance([0,*order]+([0] if closed else [])) for order in itertools.permutations(range(1,4)))
       row={'alpha':alpha,'p':p,'budget':budget,'closed':closed,'seed':seed,
            'evaluations':len(log),'valid_shots':sum(c for s,c,t in valid),
            'optimal_shots':sum(c for s,c,t in valid if np.isclose(distance(t),optimum)),
            'top_bitstring':top,'top_count':counts[top],
            'top_km':distance(toproute) if toproute is not None else None,
            'top_optimal':bool(toproute is not None and np.isclose(distance(toproute),optimum))}
       results.append(row)
       print(json.dumps(row),flush=True)
    x_results = results
    from qiskit import QuantumCircuit
    from qiskit.circuit import Parameter
    from qiskit.circuit.library import PauliEvolutionGate
    from qiskit.quantum_info import SparsePauliOp,Operator,Statevector

    # Four-qubit excitation swaps |1001> and |0110>, and leaves all other states unchanged.
    transition=np.zeros((16,16),dtype=complex)
    transition[9,6]=transition[6,9]=1
    local_mixer=SparsePauliOp.from_operator(Operator(transition))
    assert len(local_mixer)==8
    m=3
    mixer=QuantumCircuit(9)
    beta=Parameter('mix_beta')
    for a,b in itertools.combinations(range(m),2):
     for p,q in itertools.combinations(range(m),2):
      mixer.append(PauliEvolutionGate(local_mixer,time=beta),[a*m+p,a*m+q,b*m+p,b*m+q])
    initial=QuantumCircuit(9)
    for position in range(m):initial.x((m-1-position)*m+position)
    # Verify the actual decomposed mixer on every valid permutation.
    for order in itertools.permutations(range(m)):
     state=QuantumCircuit(9)
     for p,city in enumerate(order):state.x(city*m+p)
     state.compose(mixer.assign_parameters({beta:.37}),inplace=True)
     probs=Statevector.from_instruction(state).probabilities_dict()
     invalid=sum(v for bits,v in probs.items() if decode(bits,3,True,False) is None)
     assert invalid<1e-12,invalid
    print('Mixer preserves all six valid assignments.',flush=True)
    results=[]
    for alpha,p,budget in [(0.5,2,200),(0.75,3,250)]:
     for closed in [True,False]:
      _,_,h,_,m=build(True,closed)
      for seed in [7,21,42,101,202,303,404,505]:
       backend=AerSimulator(max_parallel_threads=4)
       sampler=SamplerV2(default_shots=1024,seed=seed,options={'backend_options':{'max_parallel_threads':4}})
       log=[]
       solver=QAOA(sampler=sampler,optimizer=COBYLA(maxiter=budget,tol=1e-4),reps=p,
           initial_state=initial,mixer=mixer,aggregation=alpha,
           initial_point=np.r_[np.full(p,.4),np.full(p,1.0)],
           pass_manager=generate_preset_pass_manager(backend=backend,optimization_level=1),
           callback=lambda i,params,mean,meta:log.append(float(np.real(mean))))
       fit=solver.compute_minimum_eigenvalue(h)
       circ=solver.ansatz.remove_final_measurements(inplace=False).assign_parameters(fit.optimal_point)
       circ.measure_all()
       counts=backend.run(transpile(circ,backend,seed_transpiler=seed),shots=1024,seed_simulator=seed).result().get_counts()
       top=max(counts,key=counts.get); toproute=decode(top,m,True,closed)
       valid=[(s,c,decode(s,m,True,closed)) for s,c in counts.items() if decode(s,m,True,closed) is not None]
       optimum=min(distance([0,*order]+([0] if closed else [])) for order in itertools.permutations(range(1,4)))
       row={'alpha':alpha,'p':p,'budget':budget,'closed':closed,'seed':seed,'evaluations':len(log),
           'valid_shots':sum(c for s,c,t in valid),
           'optimal_shots':sum(c for s,c,t in valid if np.isclose(distance(t),optimum)),
           'top_bitstring':top,'top_count':counts[top],
           'top_km':distance(toproute) if toproute is not None else None,
           'top_optimal':bool(toproute is not None and np.isclose(distance(toproute),optimum))}
       results.append(row)
       print(json.dumps(row),flush=True)
    for row in x_results:
        row['mixer'] = 'X'; row['initial_state'] = 'Hadamard superposition'
    for row in results:
        row['mixer'] = 'permutation swap'; row['initial_state'] = 'reverse input order'
    combined = x_results + results
    (root/'docs/qaoa_cvar_trials.json').write_text(json.dumps(combined,indent=2))
    print('Saved',len(combined),'trials to docs/qaoa_cvar_trials.json')


if __name__ == '__main__':
    main()
