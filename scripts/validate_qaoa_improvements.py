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
results=[]
for reduced in [False,True]:
 for closed in [True,False]:
  qp,qubo,h,offset,m=build(reduced,closed)
  for seed in [7,21,42,101,202]:
   started=time.perf_counter()
   backend=AerSimulator(max_parallel_threads=4)
   sampler=SamplerV2(default_shots=1024,seed=seed,options={'backend_options':{'max_parallel_threads':4}})
   history=[]
   qaoa=QAOA(sampler=sampler,optimizer=COBYLA(maxiter=100,tol=1e-3),reps=2,
      pass_manager=generate_preset_pass_manager(backend=backend,optimization_level=1),
      initial_point=np.array([0.2,0.2,0.2,0.2]),
      callback=lambda i,params,mean,meta:history.append(float(np.real(mean))))
   fit=qaoa.compute_minimum_eigenvalue(h)
   circuit=qaoa.ansatz.remove_final_measurements(inplace=False).assign_parameters(fit.optimal_point)
   circuit.measure_all()
   counts=backend.run(transpile(circuit,backend,seed_transpiler=seed),shots=1024,seed_simulator=seed).result().get_counts()
   valid=[(s,c,decode(s,m,reduced,closed)) for s,c in counts.items() if decode(s,m,reduced,closed) is not None]
   # Benchmark evaluated only after selecting measured results.
   best=min(valid,key=lambda x:distance(x[2])) if valid else None
   optimum=min(distance([0,*p]+([0] if closed else [])) for p in itertools.permutations(range(1,4)))
   row={'reduced':reduced,'closed':closed,'qubits':h.num_qubits,'seed':seed,'p':2,'maxiter':100,
        'valid_shots':sum(x[1] for x in valid),'best_km':distance(best[2]) if best else None,
        'exact_km':optimum,'optimal_found':bool(best and np.isclose(distance(best[2]),optimum)),
        'seconds':time.perf_counter()-started,'evaluations':len(history)}
   results.append(row)
   (root/'docs/qaoa_improvement_trials.json').write_text(json.dumps(results,indent=2))
   print(json.dumps(row),flush=True)
